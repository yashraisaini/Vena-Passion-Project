import { useState } from 'react'
import { medications, catMeta } from '../data/medications'
import MedModal from './MedModal'
import styles from './Library.module.css'

const filters = [
  { key: 'all',       label: 'All' },
  { key: 'factor8',   label: 'Factor VIII' },
  { key: 'factor9',   label: 'Factor IX' },
  { key: 'nonfactor', label: 'Non-factor' },
  { key: 'vwd',       label: 'Von Willebrand' },
  { key: 'gene',      label: 'Gene therapy' },
  { key: 'supportive',label: 'Supportive' },
]

export default function Library({ onAdd, addedNames = [] }) {
  const [active, setActive] = useState('all')
  const [modal,  setModal]  = useState(null)

  const visible = active === 'all' ? medications : medications.filter(m => m.category === active)

  return (
    <>
      <div className={styles.filters} role="group" aria-label="Filter treatments">
        {filters.map(f => (
          <button
            key={f.key}
            className={`${styles.fBtn} ${active === f.key ? styles.active : ''}`}
            onClick={() => setActive(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className={styles.grid}>
        {visible.map(med => {
          const m = catMeta[med.category]
          const added = addedNames.includes(med.name)
          return (
            <div
              key={med.id}
              className={styles.card}
              style={{ '--cc': `rgba(${m.color},1)` }}
              onClick={() => setModal(med)}
            >
              <span className={styles.tag}>{m.label}</span>
              <h3 className={styles.name}>{med.name}</h3>
              <p className={styles.generic}>{med.generic}</p>
              <p className={styles.route}>{med.route}</p>
              {onAdd && (
                <button
                  className={`${styles.addBtn} ${added ? styles.added : ''}`}
                  onClick={e => { e.stopPropagation(); if (!added) onAdd(med) }}
                  aria-label={added ? `${med.name} added` : `Add ${med.name}`}
                >
                  {added ? '✓' : '+'}
                </button>
              )}
            </div>
          )
        })}
      </div>

      {modal && (
        <MedModal
          med={modal}
          onClose={() => setModal(null)}
          onAdd={onAdd ? () => { onAdd(modal); setModal(null) } : null}
          isAdded={addedNames.includes(modal?.name)}
        />
      )}
    </>
  )
}
