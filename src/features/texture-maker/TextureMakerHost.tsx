/**
 * Mounts the pixel editor once, for the whole app.
 *
 * Anywhere that needs a texture calls `openTextureMaker` and gets the finished
 * asset back through a callback, so drawing an icon is a modal over whatever
 * you were doing rather than a trip to another screen.
 */

import { AnimatePresence, motion } from 'framer-motion'

import { useTextureMaker } from '../../state/textureMaker'
import { TextureMaker } from './TextureMaker'

export function TextureMakerHost() {
  const { request, close } = useTextureMaker()

  return (
    <AnimatePresence>
      {request ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/70 p-4 backdrop-blur-sm md:p-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.14 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close()
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.995 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            className="flex h-full max-h-[880px] w-full max-w-6xl overflow-hidden rounded-xl border border-ink-600 bg-ink-900 shadow-float"
          >
            <div className="flex min-h-0 flex-1 flex-col">
              <TextureMaker
                key={`${request.title}-${request.startFrom?.id ?? 'new'}`}
                title={request.title}
                size={request.size}
                sheet={request.sheet ?? null}
                uvTemplate={request.uvTemplate ?? null}
                startFrom={request.startFrom ?? null}
                fileName={request.fileName}
                onSave={request.onSave}
                onClose={close}
              />
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
