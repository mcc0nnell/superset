# Licensed to the Apache Software Foundation (ASF) under one
# or more contributor license agreements.  See the NOTICE file
# distributed with this work for additional information
# regarding copyright ownership.  The ASF licenses this file
# to you under the Apache License, Version 2.0 (the
# "License"); you may not use this file except in compliance
# with the License.  You may obtain a copy of the License at
#
#   http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing,
# software distributed under the License is distributed on an
# "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
# KIND, either express or implied.  See the License for the
# specific language governing permissions and limitations
# under the License.
from __future__ import annotations

from contextlib import nullcontext
from datetime import datetime, timezone
from unittest import mock

from superset.tasks import export_dashboard_excel as module


def test_evidence_upload_failure_does_not_withhold_workbook(tmp_path) -> None:
    user = mock.MagicMock()
    user.email = "user@example.com"
    dashboard = mock.MagicMock()
    dashboard.id = 42
    dashboard.dashboard_title = "Fund Operations"
    dashboard.changed_on = datetime(2026, 9, 6, 13, 30, tzinfo=timezone.utc)

    fake_app = mock.MagicMock()
    fake_app.config.__getitem__.side_effect = {
        "EXCEL_EXPORT_S3_BUCKET": "bucket",
        "EXCEL_EXPORT_S3_KEY_PREFIX": "exports/",
        "EXCEL_EXPORT_LINK_TTL_SECONDS": 3600,
    }.__getitem__

    def build_workbook(path, *_args, **_kwargs):
        with open(path, "wb") as handle:
            handle.write(b"exact-workbook-bytes")
        return {}

    s3 = mock.MagicMock()
    s3.generate_presigned_url.side_effect = lambda _bucket, key, _ttl: (
        f"https://signed/{key}"
    )
    s3.upload_bytes_to_s3.side_effect = RuntimeError("evidence store unavailable")

    email = mock.MagicMock()
    email.build_subject.return_value = "subject"
    email.build_success_email.return_value = "body"

    db = mock.MagicMock()
    db.session.query.return_value.filter_by.return_value.one_or_none.return_value = (
        dashboard
    )
    security_manager = mock.MagicMock()
    security_manager.get_user_by_id.return_value = user

    with (
        mock.patch.object(module, "current_app", fake_app),
        mock.patch.object(module, "db", db),
        mock.patch.object(module, "security_manager", security_manager),
        mock.patch.object(module, "_build_workbook", side_effect=build_workbook),
        mock.patch.object(module, "s3", s3),
        mock.patch.object(module, "email", email),
        mock.patch.object(module, "override_user", return_value=nullcontext()),
        mock.patch.object(module, "ReleaseDistributedLock"),
        mock.patch.object(module.logger, "exception") as log_exception,
    ):
        module.export_dashboard_excel(
            dashboard_id=42,
            user_id=7,
            active_data_mask={"NATIVE_FILTER-region": {"extraFormData": {}}},
            job_id="job-1",
            mode="data",
        )

    s3.upload_file_to_s3.assert_called_once()
    s3.upload_bytes_to_s3.assert_called_once()
    email.build_failure_email.assert_not_called()
    email.send_export_email.assert_called_once()
    _, kwargs = email.build_success_email.call_args
    assert kwargs["download_url"] == "https://signed/exports/42/job-1.xlsx"
    assert kwargs["evidence_url"] is None
    assert len(kwargs["artifact_sha256"]) == 64
    log_exception.assert_any_call(
        "Failed to upload Excel export evidence for job %s", "job-1"
    )
