"use client"

export const title = "Rotating Text"

import { AnimatePresence, type HTMLMotionProps, motion, type Transition } from "motion/react"
import * as React from "react"
import { cn } from "@/lib/utils"
import { Shimmer } from "../ai-elements/shimmer"

type RotatingTextProps = {
    text: string | string[]
    duration?: number
    transition?: Transition
    y?: number
    containerClassName?: string
} & HTMLMotionProps<"div">

function RotatingText({
    text,
    y = -50,
    duration = 6000,
    transition = { duration: 0.7, ease: "easeOut" },
    containerClassName,
    ...props
}: RotatingTextProps) {
    const [index, setIndex] = React.useState(0)

    React.useEffect(() => {
        if (!Array.isArray(text)) {
            return
        }
        const interval = setInterval(() => {
            setIndex(prevIndex => (prevIndex + 1) % text.length)
        }, duration)
        return () => clearInterval(interval)
    }, [text, duration])

    const currentText = Array.isArray(text) ? text[index] : text

    return (
        <div className={cn("overflow-hidden py-1", containerClassName)}>
            <AnimatePresence mode="wait">
                <motion.div
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y }}
                    initial={{ opacity: 0, y: -y }}
                    key={currentText}
                    transition={transition}
                    {...(props as any)}
                >
                    <Shimmer>
                        {currentText}
                    </Shimmer>
                </motion.div>
            </AnimatePresence>
        </div>
    )
}

export { RotatingText, type RotatingTextProps }
export default RotatingText
