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
import { LOG_ACTIONS_DASHBOARD_DOWNLOAD_EVIDENCE_MANIFEST } from 'src/logger/LogUtils';
import logger from 'src/middleware/loggerMiddleware';

test('evidence manifest events retain the state hash and active filter context', () => {
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
        eventName: LOG_ACTIONS_DASHBOARD_DOWNLOAD_EVIDENCE_MANIFEST,
        eventData: {
          state_sha256: 'abc123',
          schema: 'org.apache.superset.evidence/v1',
        },
      },
    });

    expect(event).toMatchObject({
      source: 'dashboard',
      event_name: LOG_ACTIONS_DASHBOARD_DOWNLOAD_EVIDENCE_MANIFEST,
      state_sha256: 'abc123',
      schema: 'org.apache.superset.evidence/v1',
      applied_filters: [
        {
          id: 'NATIVE_FILTER-region',
          name: 'Region',
          has_value: true,
        },
      ],
    });
    expect(JSON.stringify(event)).not.toContain('East');
  } finally {
    locationSpy.mockRestore();
  }
});
