<template>
  <div class="role-schedules" style="margin-top: 2rem;">
    <h2>Eligible Roles</h2>
    <div v-if="loadingRoles" class="loading-container">
      <div class="spinner"></div>
      <p>Loading role schedules...</p>
    </div>
    <template v-else>
      <table v-if="roleSchedules.length > 0" class="accounts-table">
        <thead>
          <tr>
            <th></th>
            <th>ID</th>
            <th>Type</th>
            <th>Role</th>
            <th>Scope</th>
            <th>Status</th>
            <th>Start Time</th>
            <th>End Time</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(schedule, index) in roleSchedules" :key="index">
            <td>
              <input
                type="checkbox"
                :checked="!!checkedRows[index]"
                @change="toggleChecked(index)"
              />
              <button
                style="margin-left: 4px;"
                type="button"
                @click="activateRole(schedule)"
              >
                Activate
              </button>
            </td>
            <td>{{ schedule.name }}</td>
            <td>{{ schedule.assignmentType }}</td>
            <td>{{ schedule.roleDefinitionId }}</td>
            <td>{{ schedule.scope || 'N/A' }}</td>
            <td>{{ schedule.status || 'N/A' }}</td>
            <td>{{ formatDate(schedule.startDateTime) }}</td>
            <td>{{ formatDate(schedule.endDateTime) }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else>No role eligibility schedules found.</p>
    </template>
    <button
      class="refresh-button"
      :disabled="loadingRoles"
      @click="fetchRoleSchedules"
    >
      {{ loadingRoles ? 'Refreshing...' : 'Refresh Roles' }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
// You must provide equivalent Vue composables for these auth helpers:
// import { getRoleEligibilitySchedules, getAllAccounts } from '../common/auth';

interface RoleAssignmentScheduleInstance {
  name?: string;
  assignmentType?: string;
  roleDefinitionId?: string;
  scope?: string;
  status?: string;
  startDateTime?: string | Date;
  endDateTime?: string | Date;
}

const props = defineProps<{ onRefresh?: () => void }>();

const loadingRoles = ref(false);
const roleSchedules = ref<RoleAssignmentScheduleInstance[]>([]);
const checkedRows = ref<Record<number, boolean>>({});

async function fetchRoleSchedules() {
  loadingRoles.value = true;
  try {
    // Replace with your actual Vue composable or API call
    const allAccounts = await getAllAccounts();
    const allRoleSchedules: RoleAssignmentScheduleInstance[] = [];
    for (const account of allAccounts) {
      for await (const schedule of getRoleEligibilitySchedules(account)) {
        allRoleSchedules.push(schedule);
      }
    }
    roleSchedules.value = allRoleSchedules;
  } catch (error) {
    console.error('Error loading role schedules:', error);
  } finally {
    loadingRoles.value = false;
  }
}

onMounted(fetchRoleSchedules);

watch(() => props.onRefresh, fetchRoleSchedules);

function toggleChecked(index: number) {
  checkedRows.value[index] = !checkedRows.value[index];
}

function activateRole(schedule: RoleAssignmentScheduleInstance) {
  // TODO: handle activation logic here
}

function formatDate(date: string | Date | undefined) {
  if (!date) return 'N/A';
  if (date instanceof Date) return date.toLocaleString();
  const d = new Date(date);
  return isNaN(d.getTime()) ? String(date) : d.toLocaleString();
}
</script>

<style scoped>
/* Add your styles here or import from your CSS */
</style>
