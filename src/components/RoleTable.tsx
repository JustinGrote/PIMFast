import { fetchTenantNameByResourceId } from "@/common/subscriptions"
import { RoleAssignmentScheduleInstance } from "@azure/arm-authorization"
import { AccountInfo } from "@azure/msal-browser"
import {
	Button,
	Checkbox,
	Group,
	Loader,
	Paper,
	Stack,
	Text,
	Title,
} from "@mantine/core"
import {
	IconPlayerPlay,
	IconQuestionMark,
	IconRefresh,
} from "@tabler/icons-react"
import {
	ManagementGroups,
	ResourceGroups,
	Subscriptions,
} from "@threeveloper/azure-react-icons"
import { DataTable } from "mantine-datatable"
import React, { useEffect, useState } from "react"
import { getAllAccounts } from "../common/auth"
import { getRoleEligibilitySchedules } from "../common/pim"

interface RoleTableProps {
	onRefresh?: () => void
}

const RoleTable: React.FC<RoleTableProps> = ({ onRefresh }) => {
	const [loadingRoles, setLoadingRoles] = useState(false)
	const [roleSchedules, setRoleSchedules] = useState<
		RoleAssignmentScheduleInstance[]
	>([])
	const [accounts, setAccounts] = useState<AccountInfo[]>([])
	const [tenantNames, setTenantNames] = useState<{ [scope: string]: string }>(
		{}
	)
	const [checkedRows, setCheckedRows] = useState<{ [key: number]: boolean }>({})

	const fetchRoleSchedules = async () => {
		setLoadingRoles(true)
		try {
			setAccounts(await getAllAccounts())
			const allRoleSchedules: RoleAssignmentScheduleInstance[] = []
			for (const account of accounts) {
				for await (const schedule of getRoleEligibilitySchedules(account)) {
					allRoleSchedules.push(schedule)
				}
			}
			setRoleSchedules(allRoleSchedules)
		} catch (error) {
			console.error("Error loading role schedules:", error)
		} finally {
			setLoadingRoles(false)
		}
	}

	useEffect(() => {
		fetchRoleSchedules()
	}, [onRefresh])

	useEffect(() => {
		const fetchTenantNames = async () => {
			if (!accounts.length || !roleSchedules.length) return
			const names: { [scope: string]: string } = {}
			for (const schedule of roleSchedules) {
				if (schedule.scope && !(schedule.scope in names)) {
					try {
						names[schedule.scope] =
							(await fetchTenantNameByResourceId(
								accounts[0],
								schedule.scope
							)) || "Unknown"
					} catch {
						names[schedule.scope] = "Unknown"
					}
				}
			}
			setTenantNames(names)
		}
		fetchTenantNames()
	}, [roleSchedules])

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

				{loadingRoles ? (
					<Group justify="center" p="xl">
						<Loader size="md" />
						<Text>Loading role schedules...</Text>
					</Group>
				) : roleSchedules.length > 0 ? (
					<DataTable
						withTableBorder
						borderRadius="xs"
						withColumnBorders
						striped
						highlightOnHover
						records={roleSchedules}
						columns={[
							{
								accessor: "actions",
								title: "",
								width: "80",
								render: (
									schedule: RoleAssignmentScheduleInstance,
									index: number
								) => (
									<Group gap="xs">
										<Checkbox
											checked={!!checkedRows[index]}
											onChange={() =>
												setCheckedRows((prev) => ({
													...prev,
													[index]: !prev[index],
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
								accessor: "roleDefinition",
								title: "Role",
								render: (schedule: RoleAssignmentScheduleInstance) => (
									<Text title={schedule.roleDefinitionId || ""}>
										{schedule.expandedProperties?.roleDefinition?.displayName ??
											"unknown"}
									</Text>
								),
							},
							{
								accessor: "scope",
								title: "Scope",
								render: (schedule: RoleAssignmentScheduleInstance) => {
									let icon
									switch (schedule.expandedProperties?.scope?.type) {
										case "resourcegroup":
											icon = <ResourceGroups />
											break
										case "subscription":
											icon = <Subscriptions />
											break
										case "managementgroup":
											icon = <ManagementGroups />
											break
										default:
											icon = <IconQuestionMark />
									}
									return (
										<Group gap="xs">
											{icon}
											<Text title={schedule.scope ?? ""}>
												{schedule.expandedProperties?.scope?.displayName ??
													"unknown"}
											</Text>
										</Group>
									)
								},
							},
							{
								accessor: "tenant",
								title: "Tenant",
								render: (schedule: RoleAssignmentScheduleInstance) => {
									if (!schedule.scope) return <Text>Unknown</Text>
									const tenantName = tenantNames[schedule.scope]
									return <Text>{tenantName || "Unknown"}</Text>
								},
							},
						]}
					/>
				) : (
					<Text>No role eligibility schedules found.</Text>
				)}
			</Stack>
		</Paper>
	)
}

export default RoleTable
