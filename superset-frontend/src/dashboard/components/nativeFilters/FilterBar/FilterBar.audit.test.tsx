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
import { act, render, screen, userEvent } from 'spec/helpers/testing-library';
import { stateWithoutNativeFilters } from 'spec/fixtures/mockStore';
import { Preset } from '@superset-ui/core';
import { SelectFilterPlugin } from 'src/filters/components';
import { FilterBarOrientation } from 'src/dashboard/types';
import * as loggerActions from 'src/logger/actions';
import { LOG_ACTIONS_CHANGE_DASHBOARD_FILTER } from 'src/logger/LogUtils';
import { testWithId } from 'src/utils/testUtils';
import FilterBar from '.';
import { FILTER_BAR_TEST_ID } from './utils';

jest.useFakeTimers({ advanceTimers: true });

class AuditTestPreset extends Preset {
  constructor() {
    super({
      name: 'Audit test filters',
      plugins: [new SelectFilterPlugin().configure({ key: 'filter_select' })],
    });
  }
}

new AuditTestPreset().register();

const getTestId = testWithId<string>(FILTER_BAR_TEST_ID, true);

const filterId = 'NATIVE_FILTER-audit-select';
const filter = {
  id: filterId,
  name: 'Region',
  filterType: 'filter_select',
  targets: [{ datasetId: 7, column: { name: 'region' } }],
  defaultDataMask: { filterState: { value: null }, extraFormData: {} },
  controlValues: {},
  cascadeParentIds: [],
  scope: { rootPath: ['ROOT_ID'], excluded: [] },
  type: 'NATIVE_FILTER',
  description: '',
  chartsInScope: [18],
  tabsInScope: [],
};

const state = {
  ...stateWithoutNativeFilters,
  dashboardInfo: {
    id: 1,
    dash_edit_perm: true,
    filterBarOrientation: FilterBarOrientation.Vertical,
    metadata: {
      native_filter_configuration: [filter],
      chart_configuration: {},
    },
  },
  dashboardState: {
    ...stateWithoutNativeFilters.dashboardState,
    activeTabs: ['ROOT_ID'],
  },
  dataMask: {
    [filterId]: {
      id: filterId,
      filterState: { value: ['East'] },
      extraFormData: {
        filters: [{ col: 'region', op: 'IN', val: ['East'] }],
      },
    },
  },
  nativeFilters: {
    filters: { [filterId]: filter },
    filtersState: {},
  },
};

test('logs privacy-safe filter context when filters are applied', async () => {
  const logEventSpy = jest.spyOn(loggerActions, 'logEvent');

  render(
    <FilterBar
      orientation={FilterBarOrientation.Vertical}
      verticalConfig={{
        width: 280,
        height: 400,
        offset: 0,
        filtersOpen: true,
        toggleFiltersBar: jest.fn(),
      }}
    />,
    {
      initialState: state,
      useDnd: true,
      useRedux: true,
      useRouter: true,
    },
  );

  await act(async () => {
    jest.advanceTimersByTime(300);
  });

  await act(async () => {
    userEvent.click(screen.getByTestId(getTestId('clear-button')));
  });

  await act(async () => {
    userEvent.click(screen.getByTestId(getTestId('apply-button')));
  });

  expect(logEventSpy).toHaveBeenCalledWith(
    LOG_ACTIONS_CHANGE_DASHBOARD_FILTER,
    {
      applied_filters: [
        {
          id: filterId,
          name: 'Region',
          has_value: false,
        },
      ],
    },
  );

  const [, eventData] = logEventSpy.mock.calls.at(-1) ?? [];
  expect(JSON.stringify(eventData)).not.toContain('East');

  logEventSpy.mockRestore();
});
