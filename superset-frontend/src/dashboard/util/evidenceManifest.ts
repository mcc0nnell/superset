/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

interface EvidenceDataMask {
  filterState?: {
    value?: unknown;
  };
}

interface EvidenceNativeFilter {
  name?: string;
}

interface EvidenceChart {
  id?: number;
  form_data?: Record<string, unknown>;
}

export interface DashboardEvidenceManifestInput {
  dashboardId: number;
  dashboardTitle: string;
  lastModifiedTime?: number;
  dataMask?: Record<string, EvidenceDataMask>;
  nativeFilters?: Record<string, EvidenceNativeFilter>;
  charts?: Record<string, EvidenceChart>;
  generatedAt?: string;
}

export interface EvidenceFilter {
  id: string;
  name?: string;
  has_value: boolean;
  value_sha256?: string;
}

export interface EvidenceChartIdentity {
  id: number;
  datasource?: unknown;
  viz_type?: unknown;
  form_data_sha256: string;
}

export interface EvidenceArtifact {
  filename: string;
  media_type: string;
  size_bytes: number;
  sha256: string;
}

export interface DashboardEvidenceManifest {
  schema: 'org.apache.superset.evidence/v1';
  generated_at: string;
  dashboard: {
    id: number;
    title: string;
    last_modified_time?: number;
  };
  privacy: {
    raw_filter_values_included: false;
  };
  filters: EvidenceFilter[];
  charts: EvidenceChartIdentity[];
  state_sha256: string;
  artifacts?: EvidenceArtifact[];
  binding_sha256?: string;
}

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        const item = (value as Record<string, unknown>)[key];
        if (item !== undefined) {
          acc[key] = canonicalize(item);
        }
        return acc;
      }, {});
  }

  return value;
};

export const stableStringify = (value: unknown): string =>
  JSON.stringify(canonicalize(value)) ?? 'null';

const bytesToSha256Hex = async (bytes: BufferSource): Promise<string> => {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('Web Crypto SHA-256 is unavailable');
  }

  const digest = await subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
};

export const sha256Hex = async (value: unknown): Promise<string> =>
  bytesToSha256Hex(new TextEncoder().encode(stableStringify(value)));

export const sha256Blob = async (blob: Blob): Promise<string> =>
  bytesToSha256Hex(await blob.arrayBuffer());

const hasFilterValue = (value: unknown): boolean => {
  if (value == null) {
    return false;
  }
  if (Array.isArray(value)) {
    return value.some(hasFilterValue);
  }
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }
  return true;
};

export const buildDashboardEvidenceManifest = async ({
  dashboardId,
  dashboardTitle,
  lastModifiedTime,
  dataMask = {},
  nativeFilters = {},
  charts = {},
  generatedAt = new Date().toISOString(),
}: DashboardEvidenceManifestInput): Promise<DashboardEvidenceManifest> => {
  const filters = await Promise.all(
    Object.entries(nativeFilters)
      .sort(([leftId], [rightId]) => leftId.localeCompare(rightId))
      .map(async ([id, filter]) => {
        const value = dataMask[id]?.filterState?.value;
        const hasValue = hasFilterValue(value);
        return {
          id,
          name: filter?.name,
          has_value: hasValue,
          ...(hasValue ? { value_sha256: await sha256Hex(value) } : {}),
        };
      }),
  );

  const chartIdentities = await Promise.all(
    Object.entries(charts)
      .sort(([leftId], [rightId]) => leftId.localeCompare(rightId))
      .map(async ([chartKey, chart]) => {
        const formData = chart?.form_data ?? {};
        return {
          id: chart?.id ?? Number(chartKey),
          datasource: formData.datasource,
          viz_type: formData.viz_type,
          form_data_sha256: await sha256Hex(formData),
        };
      }),
  );

  const state = {
    dashboard: {
      id: dashboardId,
      title: dashboardTitle,
      ...(lastModifiedTime !== undefined
        ? { last_modified_time: lastModifiedTime }
        : {}),
    },
    privacy: {
      raw_filter_values_included: false as const,
    },
    filters,
    charts: chartIdentities,
  };

  return {
    schema: 'org.apache.superset.evidence/v1',
    generated_at: generatedAt,
    ...state,
    state_sha256: await sha256Hex(state),
  };
};

export const bindArtifactToDashboardEvidenceManifest = async (
  manifest: DashboardEvidenceManifest,
  blob: Blob,
  filename: string,
): Promise<DashboardEvidenceManifest> => {
  const artifact: EvidenceArtifact = {
    filename,
    media_type: blob.type || 'application/octet-stream',
    size_bytes: blob.size,
    sha256: await sha256Blob(blob),
  };

  const artifacts = [...(manifest.artifacts ?? []), artifact].sort(
    (left, right) => left.filename.localeCompare(right.filename),
  );
  const binding_sha256 = await sha256Hex({
    state_sha256: manifest.state_sha256,
    artifacts,
  });

  return {
    ...manifest,
    artifacts,
    binding_sha256,
  };
};

export const downloadDashboardEvidenceManifest = (
  manifest: DashboardEvidenceManifest,
): void => {
  const blob = new Blob([`${JSON.stringify(manifest, null, 2)}\n`], {
    type: 'application/json',
  });
  const url = window.URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download =
      manifest.artifacts?.length === 1
        ? `${manifest.artifacts[0].filename}.evidence.json`
        : `dashboard_${manifest.dashboard.id}_evidence.json`;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  } finally {
    window.URL.revokeObjectURL(url);
  }
};
