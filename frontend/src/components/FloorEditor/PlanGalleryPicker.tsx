/**
 * PlanGalleryPicker — shows reconstructions for selection in Step 5.
 *
 * Per mockup: search input + single "Все планы" status-filter dropdown.
 * Building/floor filtering has been removed from the gallery panel since
 * building+floor are now global selectors in the top header.
 * Cards display thumbnail + name like "A11.5 — Этаж 11" + optional tag.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { reconstructionApi, type ReconstructionListItem } from '../../api/apiService';
import type { Building } from '../../types/hierarchy';
import styles from './PlanGalleryPicker.module.css';

type PlanFilter = 'all' | 'bound' | 'unbound';

interface PlanGalleryPickerProps {
  /** Passed through for any future use; not used for filtering directly */
  buildings: Building[];
  selectedReconstructionId: number | null;
  onSelect: (id: number) => void;
}

export const PlanGalleryPicker: React.FC<PlanGalleryPickerProps> = ({
  buildings: _buildings,
  selectedReconstructionId,
  onSelect,
}) => {
  const [search, setSearch] = useState('');
  const [planFilter, setPlanFilter] = useState<PlanFilter>('all');
  const [reconstructions, setReconstructions] = useState<ReconstructionListItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchRecons = useCallback(async () => {
    setIsLoading(true);
    try {
      const filters: Parameters<typeof reconstructionApi.getReconstructions>[0] = {};
      // status=3 means "Done" / completed reconstructions
      filters.status = 3;
      if (search) filters.search = search;
      const data = await reconstructionApi.getReconstructions(filters);
      setReconstructions(data);
    } catch {
      setReconstructions([]);
    } finally {
      setIsLoading(false);
    }
  }, [search]);

  useEffect(() => {
    void fetchRecons();
  }, [fetchRecons]);

  // Client-side filter by bound/unbound status relative to current selection
  const filtered = reconstructions.filter((r) => {
    if (planFilter === 'bound') return r.id === selectedReconstructionId;
    return true;
  });

  return (
    <div className={styles.wrap}>
      {/* Filters: search + single status dropdown */}
      <div className={styles.filters}>
        <input
          className={styles.searchInput}
          type="text"
          placeholder="Поиск по названию..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className={styles.filterSelect}
          value={planFilter}
          onChange={(e) => setPlanFilter(e.target.value as PlanFilter)}
        >
          <option value="all">Все планы</option>
          <option value="bound">Привязанные</option>
        </select>
      </div>

      {/* Gallery */}
      {isLoading ? (
        <div className={styles.loading}>Загрузка...</div>
      ) : filtered.length === 0 ? (
        <div className={styles.empty}>Нет планов</div>
      ) : (
        <div className={styles.grid}>
          {filtered.map((r) => {
            const isSelected = r.id === selectedReconstructionId;
            // Build card label like "A11.5 — Этаж 11"
            const label = r.floor
              ? `${r.floor.building_code} — Этаж ${r.floor.number}`
              : r.name ?? '—';
            return (
              <button
                key={r.id}
                className={`${styles.card} ${isSelected ? styles.cardSelected : ''}`}
                onClick={() => onSelect(r.id)}
                type="button"
              >
                {r.preview_url ? (
                  <img
                    src={r.preview_url}
                    alt={r.name ?? 'Plan'}
                    className={styles.cardThumb}
                  />
                ) : (
                  <div className={styles.cardThumbEmpty}>🖼</div>
                )}
                <div className={styles.cardInfo}>
                  <span className={styles.cardName}>{r.name ?? label}</span>
                  {r.floor && (
                    <span className={styles.cardFloor}>{label}</span>
                  )}
                </div>
                {isSelected && <span className={styles.checkmark}>✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
