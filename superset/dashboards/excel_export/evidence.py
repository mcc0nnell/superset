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
"""Cryptographic evidence for asynchronous dashboard Excel exports."""

from __future__ import annotations

import hashlib
import json
import os
from datetime import datetime
from typing import Any

SCHEMA = "org.apache.superset.excel-export-evidence/v1"
XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _canonical_json_bytes(value: Any) -> bytes:
    """Serialize JSON deterministically for hashing."""
    return json.dumps(
        value,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")


def sha256_value(value: Any) -> str:
    """SHA-256 of a canonical JSON value."""
    return hashlib.sha256(_canonical_json_bytes(value)).hexdigest()


def sha256_file(path: str) -> str:
    """SHA-256 of the exact bytes in ``path`` without loading it all in memory."""
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def build_excel_export_evidence(
    *,
    path: str,
    artifact_filename: str,
    dashboard_id: int,
    dashboard_title: str,
    dashboard_changed_on: datetime | None,
    active_data_mask: dict[str, Any],
    job_id: str,
    mode: str,
    requested_at: datetime,
    completed_at: datetime,
    errored: dict[str, list[str]],
    config_snapshot_sha256: str | None = None,
    config_snapshot_verified: bool = False,
) -> dict[str, Any]:
    """Describe the exact workbook and the worker state that produced it.

    Browser-side dashboard evidence is a different scope. For asynchronous Excel
    exports this attestation records the worker-observed dashboard revision and,
    when the API supplied an enqueue fingerprint, whether dashboard/chart export
    configuration was verified unchanged before workbook generation.
    """
    payload: dict[str, Any] = {
        "schema": SCHEMA,
        "generated_at": completed_at.isoformat(),
        "dashboard": {
            "id": dashboard_id,
            "title": dashboard_title,
            "changed_on": (
                dashboard_changed_on.isoformat() if dashboard_changed_on else None
            ),
        },
        "job": {
            "id": job_id,
            "mode": mode,
            "requested_at": requested_at.isoformat(),
        },
        "filters": {
            "active_data_mask_sha256": sha256_value(active_data_mask),
        },
        "artifact": {
            "filename": artifact_filename,
            "media_type": XLSX_MEDIA_TYPE,
            "size_bytes": os.path.getsize(path),
            "sha256": sha256_file(path),
        },
        "export": {
            "skipped_charts": errored,
        },
    }
    if config_snapshot_sha256:
        payload["configuration"] = {
            "scope": "dashboard-chart-export-config/v1",
            "snapshot_sha256": config_snapshot_sha256,
            "verified_against_enqueue": config_snapshot_verified,
        }
    payload["attestation_sha256"] = sha256_value(payload)
    return payload


def serialize_excel_export_evidence(evidence: dict[str, Any]) -> bytes:
    """Pretty JSON sidecar with a trailing newline for human inspection."""
    return (
        json.dumps(evidence, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    ).encode("utf-8")
