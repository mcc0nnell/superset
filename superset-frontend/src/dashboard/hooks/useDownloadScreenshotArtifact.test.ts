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
import { act, renderHook } from '@testing-library/react';
import { SupersetClient } from '@superset-ui/core';
import { logging } from '@apache-superset/core/utils';
import { useDownloadScreenshot } from './useDownloadScreenshot';
import { DownloadScreenshotFormat } from '../components/menu/DownloadMenuItems/types';

jest.mock('@superset-ui/core', () => ({
  SupersetClient: {
    post: jest.fn(),
    get: jest.fn(),
  },
  SupersetApiError: class SupersetApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
}));

jest.mock('@apache-superset/core/utils', () => ({
  logging: {
    error: jest.fn(),
  },
}));

jest.mock('react-redux', () => ({
  useSelector: jest.fn(() => undefined),
}));

jest.mock('src/components/MessageToasts/withToasts', () => ({
  useToasts: () => ({
    addDangerToast: jest.fn(),
    addSuccessToast: jest.fn(),
    addInfoToast: jest.fn(),
  }),
}));

jest.mock('src/utils/urlUtils', () => ({
  getDashboardUrlParams: jest.fn(() => []),
}));

const flushPromises = async () => {
  for (let i = 0; i < 12; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
};

test('passes exact screenshot bytes to evidence binding without blocking download on failure', async () => {
  jest.useFakeTimers();
  const blob = new Blob(['exact-pdf-bytes'], { type: 'application/pdf' });
  const onArtifactReady = jest.fn().mockRejectedValue(new Error('hash failed'));

  (SupersetClient.post as jest.Mock).mockResolvedValue({
    json: { cache_key: 'cache-key' },
  });
  (SupersetClient.get as jest.Mock).mockResolvedValue({
    headers: new Headers({
      'Content-Disposition': 'attachment; filename="dashboard.pdf"',
    }),
    blob: jest.fn().mockResolvedValue(blob),
  });

  Object.assign(window.URL, {
    createObjectURL: jest.fn(() => 'blob:mock'),
    revokeObjectURL: jest.fn(),
  });
  const clickSpy = jest
    .spyOn(HTMLAnchorElement.prototype, 'click')
    .mockImplementation(() => {});

  const { result } = renderHook(() =>
    useDownloadScreenshot(123, undefined, onArtifactReady),
  );

  await act(async () => {
    result.current(DownloadScreenshotFormat.PDF);
    await flushPromises();
  });

  expect(onArtifactReady).toHaveBeenCalledWith({
    blob,
    fileName: 'dashboard.pdf',
    format: DownloadScreenshotFormat.PDF,
  });
  expect(logging.error).toHaveBeenCalledWith(
    'Failed to bind screenshot evidence',
    expect.objectContaining({
      dashboardId: 123,
      format: DownloadScreenshotFormat.PDF,
      fileName: 'dashboard.pdf',
    }),
  );
  expect(clickSpy).toHaveBeenCalledTimes(1);

  clickSpy.mockRestore();
  jest.clearAllTimers();
  jest.useRealTimers();
});
