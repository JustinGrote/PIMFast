import React, { useState, useEffect } from 'react';
import { RoleAssignmentScheduleInstance } from '@azure/arm-authorization';
import { getAllAccounts } from '../common/auth';
import { getRoleEligibilitySchedules } from '../common/pim';

interface RoleTableProps {
  onRefresh?: () => void;
}

const RoleTable: React.FC<RoleTableProps> = ({ onRefresh }) => {
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [roleSchedules, setRoleSchedules] = useState<RoleAssignmentScheduleInstance[]>([]);
  const [checkedRows, setCheckedRows] = useState<{ [key: number]: boolean }>({});

  const fetchRoleSchedules = async () => {
    setLoadingRoles(true);
    try {
      const allAccounts = await getAllAccounts();
      const allRoleSchedules: RoleAssignmentScheduleInstance[] = [];
      for (const account of allAccounts) {
        for await (const schedule of getRoleEligibilitySchedules(account)) {
          allRoleSchedules.push(schedule);
        }
      }
      setRoleSchedules(allRoleSchedules);
    } catch (error) {
      console.error('Error loading role schedules:', error);
    } finally {
      setLoadingRoles(false);
    }
  };

  useEffect(() => {
    fetchRoleSchedules();
  }, [onRefresh]);

  return (
    <div className="role-schedules" style={{ marginTop: '2rem' }}>
      <h2>Eligible Roles</h2>
      {loadingRoles ? (
        <div className="loading-container">
          <div className="spinner"></div>
          <p>Loading role schedules...</p>
        </div>
      ) : roleSchedules.length > 0 ? (
        <table className="accounts-table">
          <thead>
            <tr>
              <th></th>
              <th>Role</th>
              <th>Scope</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {roleSchedules.map((schedule, index) => (
              <tr key={index}>
                <td>
                  <input
                    type="checkbox"
                    checked={!!checkedRows[index]}
                    onChange={() =>
                      setCheckedRows(prev => ({
                        ...prev,
                        [index]: !prev[index]
                      }))
                    }
                  />
                  <button
                    style={{
                      marginLeft: 4,
                      height: 'auto',
                      padding: '0.25em 0.75em',
                      fontSize: 'inherit',
                      lineHeight: 'inherit',
                      verticalAlign: 'middle'
                    }}
                    type="button"
                    onClick={() => {/* TODO: handle activation logic here */}}
                  >
                    Activate
                  </button>
                </td>
                <td title={schedule.roleDefinitionId}>
                  {schedule.expandedProperties?.roleDefinition?.displayName ?? 'unknown'}</td>
                <td title={schedule.scope ?? ''}>
                  {schedule.expandedProperties?.scope?.displayName ?? 'unknown'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p>No role eligibility schedules found.</p>
      )}
      <button
        className="refresh-button"
        onClick={fetchRoleSchedules}
        disabled={loadingRoles}
      >
        {loadingRoles ? 'Refreshing...' : 'Refresh Roles'}
      </button>
    </div>
  );
};

export default RoleTable;
