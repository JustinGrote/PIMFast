export function isEmptyObject(obj: Record<string, unknown>): boolean {
	return obj !== null && typeof obj === 'object' && Object.keys(obj).length === 0
}

export function throwIfNotType<T>(value: unknown, type: string): asserts value is T {
	if (typeof value !== type) {
		throw value
	}
}
export function throwIfNotError(value: unknown): asserts value is Error {
	if (value && !(value instanceof Error)) {
		throw value
	}
}
/** Enables throwing of errors from places a direct throw isn't support, such as in null conditionals (??) */
export function throwError(message: string | string[], cause?: string): never {
	throw new Error(Array.isArray(message) ? message.join(', ') : message, {
		cause: cause,
	})
}

/**
 * Converts an array of objects into a record using the specified property as the key.
 * @param items The array of objects to convert
 * @param key The property name to use as the key
 */
export function toRecord<T extends Record<string, any>, K extends keyof T>(items: T[], key: K): Record<string, T> {
	return items.reduce<Record<string, T>>((acc, item) => {
		const keyValue = item[key]
		if (typeof keyValue === 'string' && keyValue) {
			if (acc[keyValue]) {
				console.warn(`Duplicate key value found: ${keyValue}. Overwriting previous value.`)
			}
			acc[keyValue] = item
		}
		return acc
	}, {})
}
