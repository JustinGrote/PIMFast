export function getMilliseconds(value: number, unit: 'seconds' | 'minutes' | 'hours'): number {
	switch (unit) {
		case 'seconds':
			return value * 1000
		case 'minutes':
			return value * 1000 * 60
		case 'hours':
			return value * 1000 * 60 * 60
	}
}
