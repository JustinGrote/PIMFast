import { Text } from '@mantine/core'
import dayjs from 'dayjs'
import durationPlugin from 'dayjs/plugin/duration'
import relativeTimePlugin from 'dayjs/plugin/relativeTime'
import { humanizer } from 'humanize-duration'
import { useEffect, useState } from 'react'
import { match, P } from 'ts-pattern'

import './ExpiresCountdown.css'

dayjs.extend(durationPlugin)
dayjs.extend(relativeTimePlugin)

/**
 * Displays a countdown to a future date in human-readable format.
 * @param futureDate The future date to count down to.
 */
interface ExpiresCountdownProps {
	// The future date to count down to
	futureDate: Date | string
	// Whether the countdown is active
	active?: boolean
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

export default function ExpiresCountdown({ futureDate, active = false }: ExpiresCountdownProps) {
	const [timeLeft, setTimeLeft] = useState<string>('')
	const [diffMs, setDiffMs] = useState<number>(0)

	useEffect(() => {
		const updateCountdown = () => {
			// Parse futureDate to a timestamp
			const end = dayjs(futureDate)
			const diff = end.diff(dayjs())
			setDiffMs(diff)

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

	// Determine styling class based on time remaining
	const getStyleClass = () => {
		const ONE_MINUTE_MS = 60 * 1000
		const TEN_MINUTES_MS = 10 * 60 * 1000

		if (!active) {
			return 'expires-countdown' // Use gray style
		}

		return match(diffMs)
			.with(P.number.between(1, ONE_MINUTE_MS), () => 'expires-countdown critical')
			.with(P.number.between(ONE_MINUTE_MS, TEN_MINUTES_MS), () => 'expires-countdown warning')
			.otherwise(() => 'expires-countdown active') // Use lime style
	}

	return (
		<Text
			className={getStyleClass()}
			title={futureDate.toString()}
		>
			{timeLeft}
		</Text>
	)
}
