import { RoleAssignmentScheduleInstance } from '@azure/arm-authorization';
import { Button, Checkbox, Group, Loader, Paper, Stack, Text, Title, ThemeIcon } from '@mantine/core';
import { IconPlayerPlay, IconRefresh, IconHierarchy3, IconBuildingBank, IconQuestionMark } from '@tabler/icons-react';
import { DataTable } from 'mantine-datatable';
import React, { useEffect, useState } from 'react';
import { getAllAccounts } from '../common/auth';
import { getRoleEligibilitySchedules } from '../common/pim';
import { ManagementGroups, ResourceGroups, Subscriptions } from '@threeveloper/azure-react-icons'

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
    <Paper shadow="xs" p="md" mt="xl">
      <Stack>
        <Group justify="space-between" align="center">
          <Title order={2}>Eligible Roles</Title>
          <Button
            onClick={fetchRoleSchedules}
            disabled={loadingRoles}
            variant="subtle"
            size="compact-icon"
          >
            <IconRefresh />
          </Button>
        </Group>

        {loadingRoles
          ? (
            <Group justify="center" p="xl">
              <Loader size="md" />
              <Text>Loading role schedules...</Text>
            </Group>
          )
          : roleSchedules.length > 0 ? (
          <DataTable
            withTableBorder
            borderRadius="xs"
            withColumnBorders
            striped
            highlightOnHover
            records={roleSchedules}
            columns={[
              {
                accessor: 'actions',
                title: '',
                width: '80',
                render: (schedule: RoleAssignmentScheduleInstance, index: number) => (
                  <Group gap="xs">
                    <Checkbox
                      checked={!!checkedRows[index]}
                      onChange={() =>
                        setCheckedRows(prev => ({
                          ...prev,
                          [index]: !prev[index]
                        }))
                      }
                    />
                    <Button variant="subtle" color="green" size="xs">
                      <IconPlayerPlay />
                    </Button>
                  </Group>
                ),
              },
              {
                accessor: 'roleDefinition',
                title: 'Role',
                render: (schedule: RoleAssignmentScheduleInstance) => (
                  <Text title={schedule.roleDefinitionId || ''}>
                    {schedule.expandedProperties?.roleDefinition?.displayName ?? 'unknown'}
                  </Text>
                ),
              },
              {
                accessor: 'scope',
                title: 'Scope',
                render: (schedule: RoleAssignmentScheduleInstance) => {
                  const type = schedule.expandedProperties?.scope?.type;
                  let icon = null;
                  if (type === 'resourcegroup') {
                    icon = (
                      <ThemeIcon variant="light" size="sm" color="blue">
                        <ResourceGroups />
                      </ThemeIcon>
                    );
                  } else if (type === 'subscription') {
                    icon = (
                      <Subscriptions />
                    );
                  } else if (type === 'managementgroup') {
                    icon = (
                      <ManagementGroups />
                    );
                  } else {
                    icon = (
                      <IconQuestionMark />
                    );
                  }
                  return (
                    <Group gap={4}>
                      {icon}
                      <Text title={schedule.scope ?? ''}>
                        {schedule.expandedProperties?.scope?.displayName ?? 'unknown'}
                      </Text>
                    </Group>
                  );
                },
              },
            ]}
          />
        ) : (
          <Text>No role eligibility schedules found.</Text>
        )}
      </Stack>
    </Paper>
  );
};

export default RoleTable;
