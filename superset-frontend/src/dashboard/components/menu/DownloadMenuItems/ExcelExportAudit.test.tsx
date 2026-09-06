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
import {
  render,
  screen,
  userEvent,
  waitFor,
} from 'spec/helpers/testing-library';
import { stateWithoutNativeFilters } from 'spec/fixtures/mockStore';
import { Menu, MenuItem } from '@superset-ui/core/components/Menu';
import { isFeatureEnabled, SupersetClient } from '@superset-ui/core';
import { LOG_ACTIONS_DASHBOARD_EXPORT_XLSX } from 'src/logger/LogUtils';
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

jest.mock('src/dashboard/hooks/useDownloadScreenshot', () => ({
  useDownloadScreenshot: jest.fn(() => jest.fn()),
}));

jest.mock('src/dashboard/util/evidenceManifest', () => ({
  bindArtifactToDashboardEvidenceManifest: jest.fn(),
  buildDashboardEvidenceManifest: jest.fn(),
  downloadDashboardEvidenceManifest: jest.fn(),
}));

jest.mock('@superset-ui/core', () => ({
  ...jest.requireActual('@superset-ui/core'),
  getClientErrorObject: jest.fn().mockResolvedValue({}),
  isFeatureEnabled: jest.fn().mockReturnValue(false),
  SupersetClient: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

const mockPost = SupersetClient.post as jest.Mock;
const mockIsFeatureEnabled = isFeatureEnabled as jest.Mock;
const logEvent = jest.fn();

const state = {
  ...stateWithoutNativeFilters,
  dashboardInfo: {
    ...stateWithoutNativeFilters.dashboardInfo,
    id: 123,
  },
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
});

test('logs the accepted Excel job id and mode', async () => {
  mockPost.mockResolvedValue({ json: { job_id: 'job-123' } });

  render(<Wrapper />, { useRedux: true, initialState: state });
  await userEvent.click(screen.getByText('Export Data to Excel'));

  await waitFor(() => {
    expect(logEvent).toHaveBeenCalledWith(LOG_ACTIONS_DASHBOARD_EXPORT_XLSX, {
      job_id: 'job-123',
      mode: 'data',
    });
  });
});

test('does not create a job audit event for a throttled export', async () => {
  mockPost.mockResolvedValue({
    json: { message: 'An Excel export is already in progress.' },
  });

  render(<Wrapper />, { useRedux: true, initialState: state });
  await userEvent.click(screen.getByText('Export Data to Excel'));

  await waitFor(() => {
    expect(mockAddSuccessToast).toHaveBeenCalledWith(
      'An export for this dashboard is already in progress.',
    );
  });
  expect(logEvent).not.toHaveBeenCalledWith(
    LOG_ACTIONS_DASHBOARD_EXPORT_XLSX,
    expect.anything(),
  );
});
