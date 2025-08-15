export function isEmptyObject(obj: Record<string, unknown>): boolean {
	return obj !== null && typeof obj === 'object' && Object.keys(obj).length === 0
}

/** Enables throwing of errors from places a direct throw isn't support, such as in null conditionals (??) */
export function throwError(message: string | string[], cause?: string): never {
	throw new Error(Array.isArray(message) ? message.join(', ') : message, {
		cause: cause,
	})
}
