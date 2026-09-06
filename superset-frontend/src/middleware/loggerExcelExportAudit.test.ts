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
import { Dispatch } from 'redux';
import { LOG_EVENT } from 'src/logger/actions';
import { LOG_ACTIONS_DASHBOARD_EXPORT_XLSX } from 'src/logger/LogUtils';
import logger from 'src/middleware/loggerMiddleware';

test('Excel job audits retain correlation id and privacy-safe filter context', () => {
  const locationSpy = jest.spyOn(window, 'location', 'get').mockReturnValue({
    ...window.location,
    href: 'http://localhost/dashboard/123/',
  } as Location);
  const store = {
    getState: () => ({
      dashboardInfo: { id: 123 },
      impressionId: 'impression_id',
      dataMask: {
        'NATIVE_FILTER-region': { filterState: { value: ['East'] } },
        'CROSS_FILTER-chart-7': {
          filterState: { value: ['cross-filter-secret'] },
        },
      },
      nativeFilters: {
        filters: {
          'NATIVE_FILTER-region': { name: 'Region' },
        },
      },
    }),
    dispatch: ((action: unknown) => action) as Dispatch,
  };

  try {
    const event = (logger as Function)(store)(jest.fn())({
      type: LOG_EVENT,
      payload: {
        eventName: LOG_ACTIONS_DASHBOARD_EXPORT_XLSX,
        eventData: { job_id: 'job-123', mode: 'data' },
      },
    });

    expect(event).toMatchObject({
      source: 'dashboard',
      dashboard_id: 123,
      event_name: LOG_ACTIONS_DASHBOARD_EXPORT_XLSX,
      job_id: 'job-123',
      mode: 'data',
      applied_filters: [
        {
          id: 'NATIVE_FILTER-region',
          name: 'Region',
          has_value: true,
        },
      ],
    });
    const serialized = JSON.stringify(event);
    expect(serialized).not.toContain('East');
    expect(serialized).not.toContain('cross-filter-secret');
  } finally {
    locationSpy.mockRestore();
  }
});
