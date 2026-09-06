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

import {
  bindArtifactToDashboardEvidenceManifest,
  buildDashboardEvidenceManifest,
  stableStringify,
} from './evidenceManifest';

const originalCrypto = globalThis.crypto;

beforeAll(() => {
  const digest = jest.fn(async (_algorithm: string, data: BufferSource) => {
    const input = new Uint8Array(data as ArrayBuffer);
    const output = new Uint8Array(32);
    input.forEach((byte, index) => {
      const outputIndex = index % output.length;
      output[outputIndex] = (output[outputIndex] + byte) % 256;
    });
    return output.buffer;
  });

  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: { subtle: { digest } },
  });
});

afterAll(() => {
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: originalCrypto,
  });
});

test('stableStringify canonicalizes object key order', () => {
  expect(stableStringify({ b: 1, a: { d: 4, c: 3 } })).toBe(
    '{"a":{"c":3,"d":4},"b":1}',
  );
});

test('builds a privacy-safe deterministic dashboard evidence manifest', async () => {
  const manifest = await buildDashboardEvidenceManifest({
    dashboardId: 42,
    dashboardTitle: 'Fund Operations',
    lastModifiedTime: 1788660000,
    generatedAt: '2026-09-06T04:00:00.000Z',
    dataMask: {
      'NATIVE_FILTER-region': { filterState: { value: ['East'] } },
      'NATIVE_FILTER-age': { filterState: { value: [null, null] } },
      'CROSS_FILTER-chart-7': {
        filterState: { value: ['internal-secret'] },
      },
    },
    nativeFilters: {
      'NATIVE_FILTER-region': { name: 'Region' },
      'NATIVE_FILTER-age': { name: 'Age' },
    },
    charts: {
      '7': {
        id: 7,
        form_data: {
          viz_type: 'table',
          datasource: '19__table',
          metrics: ['count'],
        },
      },
    },
  });

  expect(manifest).toMatchObject({
    schema: 'org.apache.superset.evidence/v1',
    generated_at: '2026-09-06T04:00:00.000Z',
    dashboard: {
      id: 42,
      title: 'Fund Operations',
      last_modified_time: 1788660000,
    },
    privacy: { raw_filter_values_included: false },
    filters: [
      {
        id: 'NATIVE_FILTER-age',
        name: 'Age',
        has_value: false,
      },
      {
        id: 'NATIVE_FILTER-region',
        name: 'Region',
        has_value: true,
      },
    ],
    charts: [
      {
        id: 7,
        datasource: '19__table',
        viz_type: 'table',
      },
    ],
  });

  expect(manifest.filters[1].value_sha256).toHaveLength(64);
  expect(manifest.charts[0].form_data_sha256).toHaveLength(64);
  expect(manifest.state_sha256).toHaveLength(64);

  const serialized = JSON.stringify(manifest);
  expect(serialized).not.toContain('East');
  expect(serialized).not.toContain('internal-secret');
  expect(serialized).not.toContain('count');
});

test('binds exact artifact bytes without changing the dashboard state hash', async () => {
  const manifest = await buildDashboardEvidenceManifest({
    dashboardId: 42,
    dashboardTitle: 'Fund Operations',
    generatedAt: '2026-09-06T04:00:00.000Z',
  });
  const firstBlob = new Blob(['raw-pdf-bytes'], { type: 'application/pdf' });
  const secondBlob = new Blob(['raw-pdf-bytes-2'], { type: 'application/pdf' });

  const first = await bindArtifactToDashboardEvidenceManifest(
    manifest,
    firstBlob,
    'fund-operations.pdf',
  );
  const second = await bindArtifactToDashboardEvidenceManifest(
    manifest,
    secondBlob,
    'fund-operations.pdf',
  );

  expect(first.state_sha256).toBe(manifest.state_sha256);
  expect(first.artifacts).toEqual([
    {
      filename: 'fund-operations.pdf',
      media_type: 'application/pdf',
      size_bytes: firstBlob.size,
      sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    },
  ]);
  expect(first.binding_sha256).toMatch(/^[0-9a-f]{64}$/);
  expect(second.artifacts?.[0].sha256).not.toBe(first.artifacts?.[0].sha256);
  expect(second.binding_sha256).not.toBe(first.binding_sha256);
});
