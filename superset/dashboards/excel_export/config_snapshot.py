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
"""Canonical dashboard/chart configuration snapshots for async Excel export."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from superset.dashboards.excel_export.evidence import sha256_value

SNAPSHOT_SCOPE = "dashboard-chart-export-config/v1"


def _iso(value: Any) -> str | None:
    return value.isoformat() if isinstance(value, datetime) else None


def build_export_config_snapshot(
    dashboard: Any,
    active_data_mask: dict[str, Any],
    mode: str,
) -> dict[str, Any]:
    """Return the canonical config inputs whose drift can change an export.

    Scope is intentionally limited to Superset dashboard/chart configuration and
    the submitted filter mask. Datasource definitions and underlying warehouse
    data are not frozen by this snapshot and need their own provenance layer.
    """
    charts = [
        {
            "id": chart.id,
            "slice_name": chart.slice_name,
            "changed_on": _iso(getattr(chart, "changed_on", None)),
            "last_saved_at": _iso(getattr(chart, "last_saved_at", None)),
            "datasource_id": chart.datasource_id,
            "datasource_type": chart.datasource_type,
            "datasource_name": chart.datasource_name,
            "viz_type": chart.viz_type,
            "params": chart.params,
            "query_context": chart.query_context,
            "cache_timeout": chart.cache_timeout,
        }
        for chart in sorted(dashboard.slices, key=lambda item: item.id)
    ]

    return {
        "scope": SNAPSHOT_SCOPE,
        "dashboard": {
            "id": dashboard.id,
            "dashboard_title": dashboard.dashboard_title,
            "changed_on": _iso(getattr(dashboard, "changed_on", None)),
            "position_json": dashboard.position_json,
            "json_metadata": dashboard.json_metadata,
            "css": dashboard.css,
            "theme_id": dashboard.theme_id,
        },
        "charts": charts,
        "active_data_mask": active_data_mask,
        "mode": mode,
    }


def export_config_snapshot_sha256(
    dashboard: Any,
    active_data_mask: dict[str, Any],
    mode: str,
) -> str:
    """SHA-256 commitment to the current dashboard/chart export configuration."""
    return sha256_value(build_export_config_snapshot(dashboard, active_data_mask, mode))
