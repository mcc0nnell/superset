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
import {
  LOG_ACTIONS_LOAD_CHART,
  LOG_ACTIONS_SELECT_DASHBOARD_TAB,
} from 'src/logger/LogUtils';
import logger from 'src/middleware/loggerMiddleware';

// eslint-disable-next-line no-restricted-globals -- TODO: Migrate from describe blocks
describe('logger middleware native filter context', () => {
  const dashboardId = 123;
  const next = jest.fn();
  const store = {
    getState: () => ({
      dashboardInfo: { id: dashboardId },
      impressionId: 'impression_id',
      dataMask: {
        'NATIVE_FILTER-region': {
          filterState: { value: ['East'] },
        },
        'NATIVE_FILTER-age': {
          filterState: { value: [null, null] },
        },
        'CROSS_FILTER-chart-1': {
          filterState: { value: ['internal-cross-filter-value'] },
        },
      },
      nativeFilters: {
        filters: {
          'NATIVE_FILTER-region': { name: 'Region' },
          'NATIVE_FILTER-age': { name: 'Age' },
        },
      },
    }),
    dispatch: ((action: unknown) => action) as Dispatch,
  };

  beforeAll(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    next.mockClear();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  test.each([
    [`http://localhost/dashboard/${dashboardId}/`, 'dashboard'],
    ['http://localhost/embedded/test-uuid/', 'embedded_dashboard'],
  ])(
    'adds privacy-safe native filter context for select-tab events on %s',
    (href, expectedSource) => {
      const locationSpy = jest.spyOn(window, 'location', 'get').mockReturnValue({
        ...window.location,
        href,
      } as Location);

      try {
        const event = (logger as Function)(store)(next)({
          type: LOG_EVENT,
          payload: {
            eventName: LOG_ACTIONS_SELECT_DASHBOARD_TAB,
            eventData: {
              target_id: 'TAB-1',
              target_name: 'Summary',
            },
          },
        });

        expect(event).toMatchObject({
          source: expectedSource,
          applied_filters: [
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
        });

        const serialized = JSON.stringify(event);
        expect(serialized).not.toContain('East');
        expect(serialized).not.toContain('internal-cross-filter-value');
      } finally {
        locationSpy.mockRestore();
      }
    },
  );

  test('does not enrich high-volume chart timing events', () => {
    const locationSpy = jest.spyOn(window, 'location', 'get').mockReturnValue({
      ...window.location,
      href: `http://localhost/dashboard/${dashboardId}/`,
    } as Location);

    try {
      const event = (logger as Function)(store)(next)({
        type: LOG_EVENT,
        payload: {
          eventName: LOG_ACTIONS_LOAD_CHART,
          eventData: {
            slice_id: 7,
            start_offset: 100,
          },
        },
      });

      expect(event).not.toHaveProperty('applied_filters');
    } finally {
      locationSpy.mockRestore();
    }
  });
});
