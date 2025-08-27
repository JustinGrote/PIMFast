import { Text } from '@mantine/core'
import dayjs from 'dayjs'
import durationPlugin from 'dayjs/plugin/duration'
import relativeTimePlugin from 'dayjs/plugin/relativeTime'
import { humanizer } from 'humanize-duration'
import { useEffect, useState } from 'react'

dayjs.extend(durationPlugin)
dayjs.extend(relativeTimePlugin)

/**
 * Displays a countdown to a future date in human-readable format.
 * @param futureDate The future date to count down to.
 */
interface ExpiresCountdownProps {
	// The future date to count down to
	futureDate: Date | string
}

const humanizeExpiration = humanizer({
	// Specify the options for the humanizer
	largest: 1,
	// language: 'shortEn',
	// languages: {
	// 	shortEn: {
	// 		y: () => 'y',
	// 		mo: () => 'mo',
	// 		w: () => 'w',
	// 		d: () => 'd',
	// 		h: () => 'h',
	// 		m: () => 'm',
	// 		s: () => 's',
	// 		ms: () => 'ms',
	// 	},
})

export default function ExpiresCountdown({ futureDate }: ExpiresCountdownProps) {
	const [timeLeft, setTimeLeft] = useState<string>('')

	useEffect(() => {
		const updateCountdown = () => {
			// Parse futureDate to a timestamp
			const end = dayjs(futureDate)
			const diff = end.diff(dayjs())

			if (diff <= 0) {
				setTimeLeft('Expired')
				return
			}

			// Show a countdown at this point
			const ONE_HOUR_MS = 60 * 60 * 1000
			if (diff < ONE_HOUR_MS) {
				const duration = dayjs.duration(diff)
				const minutes = String(duration.minutes()).padStart(2, '0')
				const seconds = String(duration.seconds()).padStart(2, '0')
				setTimeLeft(`${minutes}:${seconds}`)
				return
			}

			setTimeLeft(humanizeExpiration(diff))
		}

		updateCountdown()
		const interval = setInterval(updateCountdown, 1000)
		return () => clearInterval(interval)
	}, [futureDate])

	return (
		<Text
			className="expires-countdown"
			title={futureDate.toString()}
		>
			{timeLeft}
		</Text>
	)
}
