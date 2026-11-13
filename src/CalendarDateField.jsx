import React, { useEffect, useRef, useState } from 'react';

const isoDate = date => `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
function selectedDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T12:00:00`);
  return Number.isFinite(date.getTime()) && isoDate(date) === value ? date : null;
}
export default function CalendarDateField({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => selectedDate(value) || new Date());
  const root = useRef(null), trigger = useRef(null), popup = useRef(null);
  useEffect(() => {
    const date = selectedDate(value);
    if (date) setMonth(date);
  }, [value]);
  useEffect(() => {
    if (!open) return;
    popup.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    popup.current?.querySelector('[aria-pressed="true"], [data-day]')?.focus();
    const outside = event => { if (!root.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  const year = month.getFullYear(), index = month.getMonth();
  const days = new Date(year, index + 1, 0).getDate();
  const offset = new Date(year, index, 1).getDay();
  const close = () => { setOpen(false); trigger.current?.focus(); };
  const select = date => { onChange(isoDate(date)); close(); };
  return (
    <div className="smart-campaign-field calendar-date-field" ref={root} onKeyDown={event => {
      if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); close(); }
    }} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
      <label htmlFor="calendar-day-date">Date (YYYY-MM-DD)</label>
      <div className="calendar-date-input">
        <input id="calendar-day-date" type="text" inputMode="numeric" placeholder="YYYY-MM-DD" pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}" maxLength={10} value={value} onChange={event => onChange(event.target.value)} aria-describedby="calendar-day-date-format" required />
        <button ref={trigger} type="button" aria-label="Open calendar" aria-expanded={open} aria-controls="calendar-day-picker" onClick={() => setOpen(current => !current)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 11h18" /></svg>
        </button>
      </div>
      <small id="calendar-day-date-format">For example: 2026-11-13</small>
      {open && (
        <div id="calendar-day-picker" className="calendar-date-popup" role="dialog" aria-label="Choose date" ref={popup}>
          <div className="calendar-date-heading">
            <button type="button" aria-label="Previous month" onClick={() => setMonth(new Date(year, index - 1, 1))}>‹</button>
            <strong aria-live="polite">{month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</strong>
            <button type="button" aria-label="Next month" onClick={() => setMonth(new Date(year, index + 1, 1))}>›</button>
          </div>
          <div className="calendar-date-grid">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => <span key={day}>{day}</span>)}
            {Array.from({ length: offset }, (_, i) => <span key={`empty-${i}`} aria-hidden="true" />)}
            {Array.from({ length: days }, (_, i) => {
              const date = new Date(year, index, i + 1), iso = isoDate(date);
              return <button key={iso} type="button" data-day={iso} aria-label={iso} aria-pressed={value === iso} aria-current={iso === isoDate(new Date()) ? 'date' : undefined} onClick={() => select(date)}>{i + 1}</button>;
            })}
          </div>
          <div className="calendar-date-footer">
            <button type="button" onClick={() => select(new Date())}>Today</button>
            <button type="button" onClick={close}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
