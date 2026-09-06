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
import { render, screen, userEvent, waitFor } from 'spec/helpers/testing-library';
import { stateWithoutNativeFilters } from 'spec/fixtures/mockStore';
import { Menu, MenuItem } from '@superset-ui/core/components/Menu';
import { isFeatureEnabled } from '@superset-ui/core';
import {
  buildDashboardEvidenceManifest,
  downloadDashboardEvidenceManifest,
} from 'src/dashboard/util/evidenceManifest';
import { LOG_ACTIONS_DASHBOARD_DOWNLOAD_EVIDENCE_MANIFEST } from 'src/logger/LogUtils';
import { useDownloadMenuItems } from '.';

const mockAddSuccessToast = jest.fn();
const mockAddDangerToast = jest.fn();

jest.mock('src/components/MessageToasts/withToasts', () => ({
  __esModule: true,
  default: (Component: React.ComponentType) => Component,
  useToasts: () => ({
    addSuccessToast: mockAddSuccessToast,
    addDangerToast: mockAddDangerToast,
  }),
}));

jest.mock('src/dashboard/util/evidenceManifest', () => ({
  buildDashboardEvidenceManifest: jest.fn(),
  downloadDashboardEvidenceManifest: jest.fn(),
}));

jest.mock('@superset-ui/core', () => ({
  ...jest.requireActual('@superset-ui/core'),
  isFeatureEnabled: jest.fn().mockReturnValue(false),
}));

const mockBuildManifest = buildDashboardEvidenceManifest as jest.Mock;
const mockDownloadManifest = downloadDashboardEvidenceManifest as jest.Mock;
const mockIsFeatureEnabled = isFeatureEnabled as jest.Mock;

const logEvent = jest.fn();

const state = {
  ...stateWithoutNativeFilters,
  dashboardInfo: {
    ...stateWithoutNativeFilters.dashboardInfo,
    id: 123,
    last_modified_time: 1788660000,
  },
  dataMask: {
    'NATIVE_FILTER-region': {
      filterState: { value: ['East'] },
      extraFormData: {},
    },
  },
  nativeFilters: {
    filters: {
      'NATIVE_FILTER-region': { name: 'Region' },
    },
    filtersState: {},
  },
  charts: {
    7: {
      id: 7,
      form_data: {
        viz_type: 'table',
        datasource: '19__table',
      },
    },
  },
};

const manifest = {
  schema: 'org.apache.superset.evidence/v1' as const,
  generated_at: '2026-09-06T04:00:00.000Z',
  dashboard: {
    id: 123,
    title: 'Test Dashboard',
    last_modified_time: 1788660000,
  },
  privacy: { raw_filter_values_included: false as const },
  filters: [],
  charts: [],
  state_sha256: 'abc123',
};

const Wrapper = () => {
  const item = useDownloadMenuItems({
    pdfMenuItemTitle: 'Export to PDF',
    imageMenuItemTitle: 'Download as Image',
    dashboardTitle: 'Test Dashboard',
    logEvent,
    dashboardId: 123,
    title: 'Download',
    userCanExport: true,
  });
  const items: MenuItem[] = [item];
  return <Menu forceSubMenuRender items={items} />;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockIsFeatureEnabled.mockReturnValue(false);
  mockBuildManifest.mockResolvedValue(manifest);
});

test('downloads an evidence manifest and logs its state hash', async () => {
  render(<Wrapper />, {
    useRedux: true,
    initialState: state,
  });

  await userEvent.click(screen.getByText('Download evidence manifest'));

  await waitFor(() => {
    expect(mockBuildManifest).toHaveBeenCalledWith({
      dashboardId: 123,
      dashboardTitle: 'Test Dashboard',
      lastModifiedTime: 1788660000,
      dataMask: state.dataMask,
      nativeFilters: state.nativeFilters.filters,
      charts: state.charts,
    });
    expect(mockDownloadManifest).toHaveBeenCalledWith(manifest);
    expect(logEvent).toHaveBeenCalledWith(
      LOG_ACTIONS_DASHBOARD_DOWNLOAD_EVIDENCE_MANIFEST,
      {
        state_sha256: 'abc123',
        schema: 'org.apache.superset.evidence/v1',
      },
    );
    expect(mockAddSuccessToast).toHaveBeenCalledWith(
      'Evidence manifest downloaded',
    );
  });
});
