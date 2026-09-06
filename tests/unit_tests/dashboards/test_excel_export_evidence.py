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

import hashlib
from datetime import datetime, timezone

from superset.dashboards.excel_export.evidence import (
    build_excel_export_evidence,
    serialize_excel_export_evidence,
)


def test_excel_export_evidence_hashes_exact_artifact_and_filter_state(tmp_path) -> None:
    path = tmp_path / "job-1.xlsx"
    artifact_bytes = b"exact-xlsx-bytes\x00\x01"
    path.write_bytes(artifact_bytes)
    changed_on = datetime(2026, 9, 6, 13, 30, tzinfo=timezone.utc)
    requested_at = datetime(2026, 9, 6, 13, 31, tzinfo=timezone.utc)
    completed_at = datetime(2026, 9, 6, 13, 32, tzinfo=timezone.utc)
    active_data_mask = {
        "NATIVE_FILTER-region": {
            "extraFormData": {"filters": [{"col": "region", "val": "East"}]}
        }
    }

    evidence = build_excel_export_evidence(
        path=str(path),
        artifact_filename="job-1.xlsx",
        dashboard_id=42,
        dashboard_title="Fund Operations",
        dashboard_changed_on=changed_on,
        active_data_mask=active_data_mask,
        job_id="job-1",
        mode="data",
        requested_at=requested_at,
        completed_at=completed_at,
        errored={},
    )

    assert evidence["schema"] == "org.apache.superset.excel-export-evidence/v1"
    assert evidence["dashboard"] == {
        "id": 42,
        "title": "Fund Operations",
        "changed_on": changed_on.isoformat(),
    }
    assert evidence["job"]["id"] == "job-1"
    assert evidence["job"]["mode"] == "data"
    assert evidence["artifact"] == {
        "filename": "job-1.xlsx",
        "media_type": (
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        ),
        "size_bytes": len(artifact_bytes),
        "sha256": hashlib.sha256(artifact_bytes).hexdigest(),
    }
    assert len(evidence["filters"]["active_data_mask_sha256"]) == 64
    assert len(evidence["attestation_sha256"]) == 64

    serialized = serialize_excel_export_evidence(evidence)
    assert serialized.endswith(b"\n")
    assert b'"attestation_sha256"' in serialized


def test_attestation_changes_when_artifact_changes_but_revision_does_not(tmp_path) -> None:
    path = tmp_path / "job.xlsx"
    now = datetime(2026, 9, 6, 13, 30, tzinfo=timezone.utc)

    def build(data: bytes):
        path.write_bytes(data)
        return build_excel_export_evidence(
            path=str(path),
            artifact_filename="job.xlsx",
            dashboard_id=42,
            dashboard_title="Fund Operations",
            dashboard_changed_on=now,
            active_data_mask={},
            job_id="job",
            mode="data",
            requested_at=now,
            completed_at=now,
            errored={},
        )

    first = build(b"first")
    second = build(b"second")

    assert first["dashboard"] == second["dashboard"]
    assert first["artifact"]["sha256"] != second["artifact"]["sha256"]
    assert first["attestation_sha256"] != second["attestation_sha256"]
