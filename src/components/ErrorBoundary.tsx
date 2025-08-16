import { Button, Code, Modal, ScrollArea, Stack, Text } from '@mantine/core'
import { Component, ReactNode } from 'react'

interface ErrorBoundaryProps {
	children: ReactNode
}

interface ErrorBoundaryState {
	hasError: boolean
	error: Error | null
	errorInfo: string | null
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
	constructor(props: ErrorBoundaryProps) {
		super(props)
		this.state = { hasError: false, error: null, errorInfo: null }
	}

	static getDerivedStateFromError(error: Error): ErrorBoundaryState {
		return { hasError: true, error, errorInfo: null }
	}

	componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
		this.setState({
			error,
			errorInfo: errorInfo.componentStack ?? '',
		})
	}

	handleClose = () => {
		this.setState({ hasError: false, error: null, errorInfo: null })
	}

	render() {
		if (this.state.hasError) {
			return (
				<Modal
					opened={true}
					onClose={this.handleClose}
					title="Application Error"
					size="lg"
				>
					<Stack>
						<Text
							size="sm"
							c="red"
						>
							An error occurred in the application:
						</Text>

						<Text fw={500}>Error Message:</Text>
						<Code
							block
							c="red"
						>
							{this.state.error?.message || 'Unknown error'}
						</Code>

						{this.state.error?.stack && (
							<>
								<Text fw={500}>Stack Trace:</Text>
								<ScrollArea.Autosize mah={200}>
									<Code block>{this.state.error.stack}</Code>
								</ScrollArea.Autosize>
							</>
						)}

						{this.state.errorInfo && (
							<>
								<Text fw={500}>Component Stack:</Text>
								<ScrollArea.Autosize mah={150}>
									<Code block>{this.state.errorInfo}</Code>
								</ScrollArea.Autosize>
							</>
						)}

						<Button
							onClick={this.handleClose}
							variant="light"
						>
							Close and Continue
						</Button>
					</Stack>
				</Modal>
			)
		}

		return this.props.children
	}
}
