export function isEmptyObject(obj: Record<string, any>): boolean {
	return obj !== null && typeof obj === 'object' && Object.keys(obj).length === 0
}
