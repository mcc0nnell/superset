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
import React from 'react';
import { render } from 'spec/helpers/testing-library';
import { stateWithoutNativeFilters } from 'spec/fixtures/mockStore';
import { Menu, MenuItem } from '@superset-ui/core/components/Menu';
import {
  bindArtifactToDashboardEvidenceManifest,
  buildDashboardEvidenceManifest,
  downloadDashboardEvidenceManifest,
} from 'src/dashboard/util/evidenceManifest';
import { useDownloadScreenshot } from 'src/dashboard/hooks/useDownloadScreenshot';
import { LOG_ACTIONS_DASHBOARD_DOWNLOAD_EVIDENCE_MANIFEST } from 'src/logger/LogUtils';
import { useDownloadMenuItems } from '.';
import { DownloadScreenshotFormat } from './types';

const mockAddSuccessToast = jest.fn();
const mockAddDangerToast = jest.fn();
const mockDownloadScreenshot = jest.fn();

jest.mock('src/components/MessageToasts/withToasts', () => ({
  __esModule: true,
  default: (Component: React.ComponentType) => Component,
  useToasts: () => ({
    addSuccessToast: mockAddSuccessToast,
    addDangerToast: mockAddDangerToast,
  }),
}));

jest.mock('src/dashboard/hooks/useDownloadScreenshot', () => ({
  useDownloadScreenshot: jest.fn(() => mockDownloadScreenshot),
}));

jest.mock('src/dashboard/util/evidenceManifest', () => ({
  buildDashboardEvidenceManifest: jest.fn(),
  bindArtifactToDashboardEvidenceManifest: jest.fn(),
  downloadDashboardEvidenceManifest: jest.fn(),
}));

const mockUseDownloadScreenshot = useDownloadScreenshot as jest.Mock;
const mockBuildManifest = buildDashboardEvidenceManifest as jest.Mock;
const mockBindArtifact = bindArtifactToDashboardEvidenceManifest as jest.Mock;
const mockDownloadManifest = downloadDashboardEvidenceManifest as jest.Mock;

const logEvent = jest.fn();
const baseManifest = {
  schema: 'org.apache.superset.evidence/v1' as const,
  generated_at: '2026-09-06T13:42:00.000Z',
  dashboard: { id: 123, title: 'Test Dashboard' },
  privacy: { raw_filter_values_included: false as const },
  filters: [],
  charts: [],
  state_sha256: 'state123',
};
const boundManifest = {
  ...baseManifest,
  artifacts: [
    {
      filename: 'dashboard.pdf',
      media_type: 'application/pdf',
      size_bytes: 9,
      sha256: 'artifact123',
    },
  ],
  binding_sha256: 'binding123',
};

const state = {
  ...stateWithoutNativeFilters,
  dashboardInfo: {
    ...stateWithoutNativeFilters.dashboardInfo,
    id: 123,
  },
};

const Wrapper = ({ userCanExport = true }: { userCanExport?: boolean }) => {
  const item = useDownloadMenuItems({
    pdfMenuItemTitle: 'Export to PDF',
    imageMenuItemTitle: 'Download as Image',
    dashboardTitle: 'Test Dashboard',
    logEvent,
    dashboardId: 123,
    title: 'Download',
    userCanExport,
  });
  const items: MenuItem[] = [item];
  return <Menu forceSubMenuRender items={items} />;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockBuildManifest.mockResolvedValue(baseManifest);
  mockBindArtifact.mockResolvedValue(boundManifest);
});

test('binds the exact webdriver artifact and logs both state and artifact hashes', async () => {
  render(<Wrapper />, { useRedux: true, initialState: state });

  const artifactReady = mockUseDownloadScreenshot.mock.calls[0][2];
  const blob = new Blob(['pdf-bytes'], { type: 'application/pdf' });
  await artifactReady({
    blob,
    fileName: 'dashboard.pdf',
    format: DownloadScreenshotFormat.PDF,
  });

  expect(mockBindArtifact).toHaveBeenCalledWith(
    baseManifest,
    blob,
    'dashboard.pdf',
  );
  expect(mockDownloadManifest).toHaveBeenCalledWith(boundManifest);
  expect(logEvent).toHaveBeenCalledWith(
    LOG_ACTIONS_DASHBOARD_DOWNLOAD_EVIDENCE_MANIFEST,
    {
      state_sha256: 'state123',
      artifact_sha256: 'artifact123',
      binding_sha256: 'binding123',
      artifact_filename: 'dashboard.pdf',
      schema: 'org.apache.superset.evidence/v1',
    },
  );
});

test('does not expose an artifact callback without dashboard export permission', () => {
  render(<Wrapper userCanExport={false} />, {
    useRedux: true,
    initialState: state,
  });

  expect(mockUseDownloadScreenshot.mock.calls[0][2]).toBeUndefined();
});
