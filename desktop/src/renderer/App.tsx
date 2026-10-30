import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowPathIcon, ArrowTopRightOnSquareIcon, ArrowDownTrayIcon, Bars3BottomLeftIcon, CheckIcon, ChevronDownIcon, ChevronRightIcon, ClockIcon, Cog6ToothIcon, DocumentDuplicateIcon, ExclamationTriangleIcon, FunnelIcon, MagnifyingGlassIcon, MinusIcon, QueueListIcon, SignalIcon, Square2StackIcon, StarIcon, SunIcon, TrashIcon, XMarkIcon, BoltIcon, ShieldCheckIcon, InboxIcon } from '@heroicons/react/24/outline';
import type { Activity, AppState, Settings, Task } from '../shared/types';
import { dateWindow, deadlineInfo, taskDeadlineInfo } from '../shared/domain';
import { interfaceCopy } from '../shared/ui-copy';
import { CompletionObserver } from './CompletionObserver';
import { AsanaNav, AsanaPanel } from './asana/AsanaPanel';
import type { AsanaState } from '../shared/asana-types';
import aureliaLogo from './assets/aurelia.png';

type Page = 'tasks' | 'activity' | 'settings' | 'asana';
type View = 'all' | 'overdue' | 'today' | 'upcoming' | 'focus';
const views: { id: View; label: string; icon: typeof QueueListIcon }[] = [
  { id: 'all', label: 'Semua Aktif', icon: QueueListIcon }, { id: 'overdue', label: 'Terlambat', icon: ExclamationTriangleIcon }, { id: 'today', label: 'Hari Ini', icon: SunIcon }, { id: 'upcoming', label: 'Mendatang', icon: ClockIcon }, { id: 'focus', label: 'Fokus Saya', icon: StarIcon },
];
const phases: Record<string, string> = { idle: 'Siap saat Anda siap', connecting: 'Menghubungkan ke PES', authenticating: 'Memeriksa sesi masuk', filtering: 'Menerapkan ruang lingkup', reading: 'Membaca daftar tasks', details: 'Mengambil riwayat tasks', validating: 'Memvalidasi hasil', saving: 'Menyimpan snapshot', success: 'Sinkronisasi selesai', cancelled: 'Sinkronisasi dibatalkan', failed: 'Sinkronisasi gagal' };
const runningPhase = (phase: string) => !['idle', 'success', 'cancelled', 'failed'].includes(phase);
const timezones = ['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura', 'UTC', 'America/New_York'];
const fields: { key: keyof Task; name: string }[] = [ {key:'TaskNo',name:'Nomor tasks'}, {key:'Status',name:'Status daftar'}, {key:'TglInput',name:'Tanggal input'}, {key:'Duedate',name:'Jatuh tempo (sumber)'}, {key:'TglApproval',name:'Tanggal approval'}, {key:'TglSelesai',name:'Tanggal selesai'}, {key:'Pic',name:'PIC'}, {key:'Jabatan',name:'Jabatan'}, {key:'DeptName',name:'Departemen'}, {key:'AsalTask',name:'Asal tasks'}, {key:'Target',name:'Target'}, {key:'Bobot',name:'Bobot'}, {key:'Lampiran',name:'Lampiran'}, {key:'Row',name:'Baris sumber'} ];
function formatDate(value: string | null | undefined, timezone: string, full = false) {
  if (!value) return 'Belum tersedia';
  const date = new Date(value); if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', ...(full ? {hour:'2-digit',minute:'2-digit'} as const : {}), timeZone: timezone }).format(date);
}
function IconButton({ label, children, onClick, active = false, disabled = false, className = '', 'data-testid': testId }: {label:string;children:ReactNode;onClick:()=>void;active?:boolean;disabled?:boolean;className?:string;'data-testid'?:string}) {
  return <button type="button" data-testid={testId} className={`icon-button ${active ? 'active' : ''} ${className}`} title={label} aria-label={label} aria-pressed={active || undefined} disabled={disabled} onClick={onClick}>{children}</button>;
}
function Empty({ title, text, children }: {title:string;text:string;children?:ReactNode}) { return <div className="empty"><div className="empty-mark"><InboxIcon /></div><h2>{title}</h2><p>{text}</p>{children}</div>; }
function workspaceUnavailable(info: AppState['agentWorkspace']) {
  if (info?.error) return info.error;
  if (!info?.path) return 'Ekspor workspace sedang disiapkan. Coba lagi setelah proses selesai.';
  return null;
}
function AgentWorkspace({ info, timezone, call }: {info:AppState['agentWorkspace'];timezone:string;call:(action:()=>Promise<unknown>,success?:string)=>Promise<void>}) {
  const unavailable = workspaceUnavailable(info);
  return <section className="settings-section agent-workspace" aria-labelledby="agent-workspace-title">
    <div className="section-icon"><Square2StackIcon/></div>
    <div className="settings-content">
      <h2 id="agent-workspace-title">Agent workspace</h2>
      <p>Folder lokal untuk bekerja bersama agent. File sumber dibuat otomatis dari snapshot PES dan dapat diperbarui saat sinkronisasi. Simpan catatan, rencana, dan hasil kerja dalam file kerja terpisah; jangan mengedit file sumber yang dibuat otomatis.</p>
      <dl className="settings-facts workspace-facts">
        <div><dt>Lokasi workspace</dt><dd className="mono">{info?.path || 'Sedang disiapkan…'}</dd></div>
        <div><dt>Ekspor terakhir</dt><dd>{info?.lastWrittenAt ? formatDate(info.lastWrittenAt,timezone,true) : 'Belum ada ekspor yang tercatat'}</dd></div>
        <div><dt>Jumlah tasks diekspor</dt><dd>{info ? info.taskCount : 'Belum tersedia'}</dd></div>
      </dl>
      {unavailable && <p id="agent-workspace-status" className={info?.error ? 'error-note' : 'workspace-status'} role={info?.error ? 'alert' : 'status'}>{unavailable}</p>}
      <div className="workspace-actions"><button type="button" className="button" data-testid="agent-workspace-open" disabled={!!unavailable} aria-describedby={unavailable ? 'agent-workspace-status' : undefined} onClick={() => void call(() => window.pes.openAgentWorkspace())}><ArrowTopRightOnSquareIcon/>Open workspace</button></div>
      <p className="subtle-note">Data asli dan teks sumber tetap dipertahankan; file kerja tidak mengubah data PES. Ekspor workspace tidak menyertakan kredensial, kata sandi, cookie, atau sesi masuk.</p>
    </div>
  </section>;
}
function taskText(task: Task) { return [task.TaskName, task.GoalTask, ...fields.map(f => `${f.name}: ${String(task[f.key] ?? '')}`), 'Riwayat target:', task.history?.text ?? '', ...(task.history?.tables ?? []).map(t => t.map(r => r.join(' | ')).join('\n'))].join('\n\n'); }

export default function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [startupError, setStartupError] = useState('');
  const [asanaState, setAsanaState] = useState<AsanaState | null>(null);
  const [asanaStatus, setAsanaStatus] = useState('all');
  const [page, setPage] = useState<Page>('tasks'); const [view, setView] = useState<View>('all');
  const [query, setQuery] = useState(''); const [status, setStatus] = useState('all'); const [sort, setSort] = useState('date-desc');
  const [selectedId, setSelectedId] = useState<string | null>(null); const [now, setNow] = useState(new Date());
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [detailWidth, setDetailWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('pes_detail_width');
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (parsed >= 260 && parsed <= 800) return parsed;
      }
    } catch {}
    return 340;
  });
  const detailWidthRef = useRef(detailWidth);
  detailWidthRef.current = detailWidth;
  const [isResizing, setIsResizing] = useState(false);
  const selectTask = useCallback((id: string | null) => {
    setSelectedId(id);
    if (id) setIsDetailOpen(true);
  }, []);
  const closeDetail = useCallback(() => {
    setIsDetailOpen(false);
    setSelectedId(null);
  }, []);
  const handleSidebarScroll = useCallback((e: React.UIEvent<HTMLElement>) => {
    const target = e.currentTarget;
    const logo = target.querySelector<HTMLElement>('.brand-hero-logo');
    if (logo) {
      const maxScroll = logo.offsetHeight;
      if (target.scrollTop > maxScroll) target.scrollTop = maxScroll;
    }
  }, []);
  const onResizePointerDown = (e: React.PointerEvent<HTMLDivElement> | React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = detailWidthRef.current;
    setIsResizing(true);
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
    const onPointerMove = (moveEvent: PointerEvent | MouseEvent) => {
      moveEvent.preventDefault();
      const deltaX = startX - moveEvent.clientX;
      const minWidth = 280;
      const maxWidth = Math.max(minWidth, Math.min(900, window.innerWidth - 260));
      const nextWidth = Math.min(maxWidth, Math.max(minWidth, Math.round(startWidth + deltaX)));
      detailWidthRef.current = nextWidth;
      setDetailWidth(nextWidth);
    };
    const onPointerEnd = () => {
      setIsResizing(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerEnd);
      window.removeEventListener('pointercancel', onPointerEnd);
      window.removeEventListener('mousemove', onPointerMove);
      window.removeEventListener('mouseup', onPointerEnd);
      try {
        localStorage.setItem('pes_detail_width', String(detailWidthRef.current));
      } catch {}
    };
    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerEnd);
    window.addEventListener('pointercancel', onPointerEnd);
    window.addEventListener('mousemove', onPointerMove, { passive: false });
    window.addEventListener('mouseup', onPointerEnd);
  };
  const onResizeDoubleClick = () => {
    const defaultWidth = 340;
    detailWidthRef.current = defaultWidth;
    setDetailWidth(defaultWidth);
    try {
      localStorage.setItem('pes_detail_width', String(defaultWidth));
    } catch {}
  };
  const onResizeKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const maxWidth = Math.max(280, Math.min(800, window.innerWidth - 320));
      const next = Math.min(maxWidth, detailWidthRef.current + 20);
      detailWidthRef.current = next;
      setDetailWidth(next);
      try { localStorage.setItem('pes_detail_width', String(next)); } catch {}
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      const next = Math.max(280, detailWidthRef.current - 20);
      detailWidthRef.current = next;
      setDetailWidth(next);
      try { localStorage.setItem('pes_detail_width', String(next)); } catch {}
    } else if (e.key === 'Home') {
      e.preventDefault();
      detailWidthRef.current = 340;
      setDetailWidth(340);
      try { localStorage.setItem('pes_detail_width', '340'); } catch {}
    }
  };
  useEffect(() => {
    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, []);
  const [toast, setToast] = useState<{ text:string;error:boolean } | null>(null);
  const [activityQuery, setActivityQuery] = useState(''); const [level, setLevel] = useState('all'); const [category, setCategory] = useState('all');
  const [clearConfirm, setClearConfirm] = useState(false); const [localSyncPending, setLocalSyncPending] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null); const activitySearchRef = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  const notify = useCallback((text: string, error = false) => setToast({text,error}), []);
  const call = useCallback(async (action: () => Promise<unknown>, success?: string) => { try { const result = await action(); if (success && result !== false) notify(success); } catch (error) { notify(error instanceof Error ? error.message : 'Tindakan tidak dapat diselesaikan.', true); } }, [notify]);
  useEffect(() => {
    mounted.current = true;
    if (!window.pes) { setStartupError('Jembatan desktop tidak tersedia. Buka PES melalui aplikasi desktop.'); return; }
    let pushed = false;
    const unsubscribe = window.pes.onState(next => { pushed = true; if (mounted.current) { setState(next); setStartupError(''); } });
    window.pes.getState().then(next => { if (mounted.current && !pushed) setState(next); }).catch(error => { if (mounted.current) setStartupError(String(error)); });
    return () => { mounted.current = false; unsubscribe(); };
  }, []);
  useEffect(() => {
    if(!window.asana)return;let alive=true,pushed=false;
    const unsubscribe=window.asana.onState(next=>{pushed=true;if(alive)setAsanaState(next);});
    window.asana.getState().then(next=>{if(alive&&!pushed)setAsanaState(next);}).catch(()=>{if(alive)notify('Katalog Asana belum tersedia. Data PES tidak berubah.',true);});
    return()=>{alive=false;unsubscribe();};
  }, [notify]);
  useEffect(() => { const update = () => setNow(new Date()); const interval = window.setInterval(update,30000); window.addEventListener('focus',update); document.addEventListener('visibilitychange',update); return () => { clearInterval(interval); window.removeEventListener('focus',update); document.removeEventListener('visibilitychange',update); }; }, []);
  useEffect(() => { if (!toast || toast.error) return; const timer = setTimeout(() => setToast(null),4500); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => {
    const setting = state?.settings.theme ?? 'dark'; const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => { document.documentElement.dataset.theme = setting === 'system' ? (media.matches ? 'dark' : 'light') : setting; };
    apply(); media.addEventListener('change',apply); return () => media.removeEventListener('change',apply);
  }, [state?.settings.theme]);
  const tz = state?.settings.timezone ?? 'Asia/Jakarta';
  const tasks = state?.snapshot?.tasks ?? [];
  const isUntitledPesTask = (t: Task) => !t.TaskName?.trim() || ['untitled task', 'untitled', 'tanpa judul'].includes(t.TaskName.trim().toLowerCase());
  const decorated = useMemo(() => tasks.map(task => ({ task, deadline: taskDeadlineInfo(task, now, tz) })), [tasks, now, tz]);
  const base = useMemo(() => decorated.filter(({task}) => !isUntitledPesTask(task) && (status === 'all' || task.Status === status) && (!query.trim() || [task.TaskNo,task.TaskName,task.GoalTask,task.Pic,task.DeptName,task.AsalTask,task.Status,task.Target].join(' ').toLocaleLowerCase('id-ID').includes(query.trim().toLocaleLowerCase('id-ID')))), [decorated,query,status]);
  const isFocus = useCallback((id: string) => !!state?.preferences[id]?.pinned || state?.focusTaskId === id, [state?.preferences,state?.focusTaskId]);
  const counts = useMemo(() => {
    const activeTasks = base.filter(t => ['Approval', 'Open'].includes(t.task.Status));
    return {
      all: base.length,
      active: activeTasks.length,
      updateTask: base.filter(t => t.task.Status === 'Update Task').length,
      completed: base.filter(t => ['Solved', 'Selesai'].includes(t.task.Status)).length,
      overdue: base.filter(t => t.deadline.kind === 'overdue').length,
      today: activeTasks.filter(t => t.deadline.kind === 'today').length,
      upcoming: activeTasks.filter(t => t.deadline.kind === 'upcoming').length,
      focus: base.filter(t => isFocus(t.task.TaskNo)).length,
    };
  }, [base, isFocus]);
  const [pesCollapsed, setPesCollapsed] = useState<Set<string>>(new Set(['completed']));
  const togglePesGroup = (key: string) => {
    setPesCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const visible = useMemo(() => {
    const order = { overdue: 0, today: 1, upcoming: 2, unknown: 3, completed: 4 };
    return base.filter(({task,deadline}) => view === 'all' || (view === 'focus' ? isFocus(task.TaskNo) : deadline.kind === view)).sort((a,b) => {
      if (sort === 'name') return a.task.TaskName.localeCompare(b.task.TaskName,'id') || a.task.TaskNo.localeCompare(b.task.TaskNo);
      if (sort === 'deadline') return order[a.deadline.kind] - order[b.deadline.kind] || (a.deadline.dueIso ?? '9999').localeCompare(b.deadline.dueIso ?? '9999') || a.task.TaskNo.localeCompare(b.task.TaskNo);
      const dateA = a.task.TglInput || a.deadline.dueIso || '';
      const dateB = b.task.TglInput || b.deadline.dueIso || '';
      return dateB.localeCompare(dateA) || b.task.TaskNo.localeCompare(a.task.TaskNo);
    });
  }, [base,view,sort,isFocus]);
  const pesGroups = useMemo(() => {
    const active = visible.filter(t => ['Approval', 'Open'].includes(t.task.Status));
    const updateTask = visible.filter(t => t.task.Status === 'Update Task');
    const completed = visible.filter(t => ['Solved', 'Selesai'].includes(t.task.Status));
    const list: { key: string; label: string; items: typeof visible }[] = [];
    if (active.length > 0) list.push({ key: 'active', label: 'PERLU DIKERJAKAN', items: active });
    if (updateTask.length > 0) list.push({ key: 'update-task', label: 'UPDATE TASK · MENUNGGU APPROVAL', items: updateTask });
    if (completed.length > 0) list.push({ key: 'completed', label: 'COMPLETED · SELESAI', items: completed });
    return list;
  }, [visible]);
  const selected = tasks.find(task => task.TaskNo === selectedId);
  const busy = localSyncPending || runningPhase(state?.sync.phase ?? 'idle');
  const sync = useCallback(() => {
    if(page === 'asana'){if(asanaState?.phase !== 'loading')void call(()=>window.asana.reloadCatalog());return;}
    if (busy || !state) return; setLocalSyncPending(true); void call(() => window.pes.sync()).finally(() => setLocalSyncPending(false));
  }, [page,asanaState?.phase,busy,state,call]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'r') { event.preventDefault(); sync(); return; }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); if(page === 'asana')document.querySelector<HTMLInputElement>('[data-testid="asana-search"]')?.focus();else if (page === 'activity') activitySearchRef.current?.focus(); else { setPage('tasks'); setTimeout(() => searchRef.current?.focus(),0); } return; }
      if (event.key === 'Escape') { setClearConfirm(false); setToast(null); closeDetail(); return; }
      const target = event.target as HTMLElement;
      if (page !== 'tasks' || target.closest('input,textarea,select,[contenteditable="true"]') || !['ArrowUp','ArrowDown'].includes(event.key) || !visible.length) return;
      event.preventDefault(); const index = visible.findIndex(t => t.task.TaskNo === selectedId); const next = Math.max(0,Math.min(visible.length - 1,index + (event.key === 'ArrowDown' ? 1 : -1))); selectTask(visible[next].task.TaskNo);
      requestAnimationFrame(() => { const row = document.querySelector<HTMLElement>(`[data-task-index="${next}"]`); row?.scrollIntoView({block:'nearest'}); if (target.closest('.task-row')) row?.querySelector<HTMLButtonElement>('.task-row-main')?.focus({preventScroll:true}); });
    };
    window.addEventListener('keydown',keydown); return () => window.removeEventListener('keydown',keydown);
  }, [sync,page,selectedId,visible,closeDetail,selectTask]);
  const activities = useMemo(() => {
    const filtered = (state?.activities ?? []).filter(a => (level === 'all' || a.level === level) && (category === 'all' || a.category === category) && [interfaceCopy(a.message),a.detail,a.runId,a.stage].join(' ').toLowerCase().includes(activityQuery.trim().toLowerCase())).sort((a,b) => b.at.localeCompare(a.at));
    const groups = new Map<string,Activity[]>(); for (const item of filtered) { const key = item.runId ?? `local-${item.at.slice(0,10)}`; groups.set(key,[...(groups.get(key) ?? []),item]); } return [...groups.entries()];
  }, [state?.activities,level,category,activityQuery]);
  const navigate = (next: Page) => { setPage(next); setClearConfirm(false); };
  const scope = dateWindow(now,tz);
  const updateSettings = (next: Partial<Settings>) => void call(() => window.pes.updateSettings(next));
  const connectionLabel = state?.connection === 'connected' ? 'Terhubung ke PES' : state?.connection === 'login-required' ? 'Perlu masuk ke PES' : 'Koneksi belum diperiksa';
  const sourceLabel = state?.snapshot ? `${state.snapshot.source === 'imported' ? 'Data tersimpan' : 'Sinkron terakhir'} · ${formatDate(state.snapshot.retrievedAt,tz,true)}` : 'Belum ada snapshot';
  return <div className={`app ${state?.settings.compact ? 'compact' : ''}`}>
    <header className="titlebar"><div className="titlebar-name"><img src={aureliaLogo} className="titlebar-icon" alt="" /><span>Aurelia</span><span className="titlebar-divider"/><span className="titlebar-caption">A personal agentic task management</span></div><div className="window-controls"><IconButton label="Minimalkan" onClick={() => void call(() => window.pes.window('minimize'))}><MinusIcon/></IconButton><IconButton label="Maksimalkan atau pulihkan" onClick={() => void call(() => window.pes.window('maximize'))}><Square2StackIcon/></IconButton><IconButton label="Tutup aplikasi" className="window-close" onClick={() => void call(() => window.pes.window('close'))}><XMarkIcon/></IconButton></div></header>
    {!state ? <main className="startup"><div className="brand-mark"><img src={aureliaLogo} className="brand-logo-img" alt="Aurelia"/></div><h1>Aurelia</h1><p role={startupError ? 'alert' : 'status'}>{startupError || 'Menyiapkan ruang kerja Anda…'}</p>{startupError && window.pes && <button className="button" onClick={() => void call(async () => { setState(await window.pes.getState()); setStartupError(''); })}>Coba lagi</button>}</main> : <div className="workspace">
      <aside className="sidebar" onScroll={handleSidebarScroll}><div className="brand brand-hero"><div className="brand-hero-logo"><img src={aureliaLogo} className="brand-hero-img" alt="Aurelia"/></div><div className="brand-hero-title">Aurelia</div><div className="brand-hero-subtitle">Your personal agent of task management</div></div><nav aria-label="Navigasi utama" className="primary-nav"><button data-testid="nav-activity" className={page === 'activity' ? 'nav-item selected' : 'nav-item'} onClick={() => navigate('activity')}><Bars3BottomLeftIcon/><span>Aktivitas</span>{state.lastError && <span className="attention-dot"/>}</button><button data-testid="nav-settings" className={page === 'settings' ? 'nav-item selected' : 'nav-item'} onClick={() => navigate('settings')}><Cog6ToothIcon/><span>Pengaturan</span></button></nav><div className="sidebar-section"><span className="eyebrow">PES TASKS</span><nav aria-label="Tampilan tasks">{views.map(({id,label,icon:Icon}) => <button key={id} className={`view-item ${page === 'tasks' && view === id ? 'selected' : ''}`} onClick={() => {setView(id);navigate('tasks');}}><Icon/><span>{label}</span><span className="view-count">{counts[id]}</span></button>)}</nav></div><AsanaNav state={asanaState} selectedStatus={page === 'asana' ? asanaStatus : '__inactive'} onSelect={next=>{setAsanaStatus(next);navigate('asana');}}/><div className="sidebar-bottom">{page !== 'asana' ? <><div className="connection-small"><span className={`connection-dot ${state.connection === 'connected' ? 'connected' : ''}`}/><span>{connectionLabel}</span></div><p className="snapshot-caption">{sourceLabel}</p></> : <><div className="connection-small"><span className={`connection-dot ${asanaState?.phase === 'ready' || asanaState?.snapshot ? 'connected' : ''}`}/><span>{asanaState?.phase === 'loading' ? 'Menyinkronkan…' : 'Terhubung ke Asana'}</span></div><p className="snapshot-caption">{asanaState?.snapshot ? `Sinkron terakhir · ${formatDate(asanaState.snapshot.retrievedAt,tz,true)}` : 'Belum ada snapshot'}</p></>}<div className="identity"><div className="avatar">MH</div><div><strong>Muhammad Hernanda</strong><span>IT Mitra Seribu Saudara</span></div></div></div></aside>
      <main className={`main ${page === 'tasks' ? 'task-main' : page === 'asana' ? 'asana-main' : ''}`}>
        {page !== 'asana' && <><div className="page-header"><div><div className="eyebrow">{page === 'tasks' ? 'SELAMAT DATANG, HERNANDA' : page === 'activity' ? 'JEJAK RUANG KERJA' : 'SESUAI CARA ANDA'}</div><h1>{page === 'tasks' ? 'List Tasks' : page === 'activity' ? 'Setiap langkah, jelas.' : 'Pengaturan.'}</h1><p>{page === 'tasks' ? 'Yang perlu perhatian. Yang bisa Anda kerjakan berikutnya.' : page === 'activity' ? 'Riwayat sebenarnya, tersimpan di perangkat ini.' : 'Tenang di permukaan. Transparan di baliknya.'}</p></div><button data-testid="sync-button" className="button primary sync-button" disabled={busy} onClick={sync}><ArrowPathIcon className={busy ? 'spin' : ''}/><span>{busy ? 'Menyinkronkan' : 'Sinkronkan'}</span><kbd>Ctrl R</kbd></button></div>
        <div className={`sync-banner ${state.sync.phase === 'failed' ? 'error' : state.sync.phase === 'success' ? 'success' : ''}`} role="status" aria-live="polite"><div className="sync-banner-icon">{state.sync.phase === 'failed' ? <ExclamationTriangleIcon/> : state.sync.phase === 'success' ? <CheckIcon/> : <SignalIcon/>}</div><div className="sync-banner-text"><strong>{phases[state.sync.phase]}</strong><span>{interfaceCopy(state.sync.message || sourceLabel)}{state.sync.completed !== undefined ? ` · ${state.sync.completed}${state.sync.total !== undefined ? ` dari ${state.sync.total}` : ''} selesai` : ''}</span>{state.lastError && state.sync.phase !== 'failed' && <span className="error-text">Upaya terakhir: {interfaceCopy(state.lastError)}</span>}</div>{busy ? <button className="text-button" onClick={() => void call(() => window.pes.cancelSync())}>Batalkan</button> : state.connection === 'login-required' ? <button className="text-button" onClick={() => void call(() => window.pes.openConnection())}>Masuk ke PES <ArrowTopRightOnSquareIcon/></button> : <button className="text-button banner-link" onClick={() => navigate('activity')}>Lihat aktivitas <ChevronRightIcon/></button>}</div>
        {state.sync.phase === 'success' && state.snapshot?.diff && <div className="snapshot-diff"><CheckIcon/><span>{state.snapshot.diff.added} baru · {state.snapshot.diff.changed} berubah · {state.snapshot.diff.scopeChanged ? 'cakupan berubah; jumlah keluar tidak dibandingkan' : `${state.snapshot.diff.outOfScope} tidak lagi di cakupan (bukan status selesai)`}</span></div>}
        </>}
        {page === 'asana' && <AsanaPanel state={asanaState} status={asanaStatus} onStatus={setAsanaStatus} timezone={tz} onNotify={notify}/>}
        {page === 'tasks' && <><section className="summary" aria-label="Ringkasan hasil pencarian dan status"><div><strong>{counts.active}</strong><span>aktif</span></div><div className="update-task-stat"><strong>{counts.updateTask}</strong><span>update task</span></div><div className="completed-stat"><strong>{counts.completed}</strong><span>selesai</span></div><div className="urgent"><strong>{counts.overdue}</strong><span>terlambat</span></div><div><strong>{counts.today}</strong><span>hari ini</span></div><div><strong>{counts.upcoming}</strong><span>mendatang</span></div><span className="summary-scope">Mengikuti pencarian & status</span></section><div className="list-toolbar"><label className="search-field"><MagnifyingGlassIcon/><input ref={searchRef} data-testid="search-input" aria-label="Cari tasks" value={query} onChange={e => setQuery(e.target.value)} placeholder="Cari tasks, nomor, atau tujuan…"/><kbd>Ctrl K</kbd></label><div className="filter-row"><label className="select-wrap"><FunnelIcon/><select aria-label="Filter status" value={status} onChange={e => setStatus(e.target.value)}><option value="all">Semua status</option><option value="Approval">Approval</option><option value="Open">Open</option><option value="Update Task">Update Task</option><option value="Selesai">Selesai</option><option value="Solved">Solved</option></select></label><label className="select-wrap sort-wrap"><select aria-label="Urutkan tasks" value={sort} onChange={e => setSort(e.target.value)}><option value="date-desc">Tanggal terbaru</option><option value="deadline">Tenggat terdekat</option><option value="name">Nama tasks A–Z</option></select></label>{(query || status !== 'all' || sort !== 'date-desc' || view !== 'all') && <button className="text-button" onClick={() => {setQuery('');setStatus('all');setSort('date-desc');setView('all');}}>Reset</button>}</div></div><div className="list-heading"><h2>{views.find(v => v.id === view)?.label} <span>{visible.length}</span></h2><span>{view === 'focus' ? 'Organisasi pribadi · tidak mengubah PES' : 'Dikelompokkan menurut status PES'}</span></div>
          {view === 'all' && base.some(item => item.deadline.kind === 'unknown') && <p className="unknown-note"><ClockIcon/>{base.filter(item => item.deadline.kind === 'unknown').length} tasks tanpa tanggal valid tetap ditampilkan; tidak dihitung sebagai terlambat.</p>}
          {view === 'focus' && state.focusTaskId && !tasks.some(t => t.TaskNo === state.focusTaskId) && <div className="missing-focus"><StarIcon/><div><strong>Fokus Anda di luar snapshot saat ini</strong><p>{state.focusTaskId} tetap disimpan sebagai pilihan lokal. Ini tidak berarti tasks selesai.</p></div><button className="text-button" onClick={() => void call(() => window.pes.setFocus(null))}>Lepas fokus</button></div>}
          {view === 'focus' && state.focusTaskId && tasks.some(t => t.TaskNo === state.focusTaskId) && <button className="focus-feature" onClick={() => selectTask(state.focusTaskId)}><BoltIcon/><div><span className="eyebrow">FOKUS BERIKUTNYA</span><strong>{tasks.find(t => t.TaskNo === state.focusTaskId)?.TaskName}</strong><span>{tasks.find(t => t.TaskNo === state.focusTaskId)?.GoalTask || 'Buka detail untuk melihat konteks tasks.'}</span></div><ChevronRightIcon/></button>}
          <div className="task-list" role="region" aria-label="Daftar tasks" tabIndex={0}>{pesGroups.length ? pesGroups.map(group => { const isCollapsed = pesCollapsed.has(group.key); return <section key={group.key} className={`pes-group pes-group-${group.key}`} data-testid={`pes-group-${group.key}`}><h2 className="pes-group-header"><button type="button" className="pes-group-toggle" aria-expanded={!isCollapsed} data-testid={`pes-toggle-${group.key}`} onClick={() => togglePesGroup(group.key)}>{isCollapsed ? <ChevronRightIcon /> : <ChevronDownIcon />}<span className="pes-group-title">{group.label}</span><span className="pes-group-badge">{group.items.length} tasks</span></button></h2>{!isCollapsed && <div className="pes-group-items">{group.items.map(({task,deadline},index) => { const tag = /\b(FE|BE)\b/.exec(`${task.TaskName} ${task.AsalTask}`)?.[1]; return <div key={task.TaskNo} className={`task-row ${selectedId === task.TaskNo ? 'is-selected' : ''}`} data-testid="task-row" data-task-index={index}><button className="task-row-main" onClick={() => selectTask(task.TaskNo)} aria-pressed={selectedId === task.TaskNo}><div className="task-meta"><span className="task-id">{task.TaskNo}</span><span className={`status-pill ${task.Status === 'Update Task' ? 'status-update' : task.Status === 'Solved' || task.Status === 'Selesai' ? 'status-done' : ''}`}>{task.Status}</span>{tag && <span className="tech-tag">{tag}</span>}{state.focusTaskId === task.TaskNo && <span className="focus-tag"><BoltIcon/>Fokus</span>}</div><h3>{task.TaskName || 'Nama tasks tidak tersedia'}</h3><div className="task-row-bottom"><span className={`deadline ${deadline.kind}`}><ClockIcon/>{deadline.label}</span><span className="due-source">{task.Duedate || 'Tanggal belum tersedia'}</span></div></button><IconButton label={`${state.preferences[task.TaskNo]?.pinned ? 'Lepas sematan' : 'Sematkan'} ${task.TaskNo}`} active={!!state.preferences[task.TaskNo]?.pinned} onClick={() => void call(() => window.pes.togglePin(task.TaskNo))}><StarIcon/></IconButton></div>; })}</div>}</section>; }) : <Empty title={!state.snapshot ? 'Mulai dengan satu sinkronisasi.' : !tasks.length ? 'Tidak ada tasks dalam snapshot ini.' : view === 'focus' ? 'Pilih yang ingin Anda utamakan.' : 'Tidak ada tasks yang cocok.'} text={!state.snapshot ? 'Hubungkan ke PES. Snapshot yang berhasil akan tetap tersedia saat Anda offline.' : !tasks.length ? 'Snapshot valid tidak memuat tasks dalam cakupan ini.' : view === 'focus' ? 'Sematkan tasks atau pilih “Fokus berikutnya” di detail. Semua pilihan hanya tersimpan lokal.' : 'Coba kata kunci lain, ubah status, atau kembali ke Semua Aktif.'}>{!state.snapshot && <button className="button" data-testid="connection-button" onClick={() => void call(() => window.pes.openConnection())}><ArrowTopRightOnSquareIcon/>Masuk ke PES</button>}</Empty>}</div><footer className="list-footer"><span>{sourceLabel}</span><button className="text-button" disabled={!state.snapshot} onClick={() => void call(() => window.pes.exportTasks('csv'))}><ArrowDownTrayIcon/>Ekspor CSV</button></footer></>}
        {page === 'activity' && <section className="activity-page"><div className="activity-toolbar"><label className="search-field"><MagnifyingGlassIcon/><input ref={activitySearchRef} aria-label="Cari aktivitas" placeholder="Cari pesan, tahap, atau run ID…" value={activityQuery} onChange={e => setActivityQuery(e.target.value)}/></label><div className="filter-row"><select aria-label="Tingkat aktivitas" value={level} onChange={e => setLevel(e.target.value)}><option value="all">Semua tingkat</option>{['info','success','warning','error'].map(v => <option key={v}>{v}</option>)}</select><select aria-label="Kategori aktivitas" value={category} onChange={e => setCategory(e.target.value)}><option value="all">Semua kategori</option>{['sync','connection','local','export','system'].map(v => <option key={v}>{v}</option>)}</select><IconButton label="Ekspor aktivitas" disabled={!state.activities.length} onClick={() => void call(() => window.pes.exportActivity())}><ArrowDownTrayIcon/></IconButton><IconButton label="Hapus riwayat aktivitas" disabled={!state.activities.length} onClick={() => setClearConfirm(true)}><TrashIcon/></IconButton></div></div>{activities.length ? activities.map(([id,items]) => <section className="activity-group" key={id}><h2>{items[0].runId ? 'Sinkronisasi' : 'Aktivitas lokal'} <span>{items[0].runId ?? formatDate(items[0].at,tz)}</span></h2>{items.map(a => <details className={`activity-item level-${a.level}`} key={a.id}><summary><span className="event-dot"/><div><strong>{interfaceCopy(a.message)}</strong><span className="event-meta">{a.level} · {a.category}{a.stage ? ` · ${a.stage}` : ''}{a.durationMs !== undefined ? ` · ${(a.durationMs / 1000).toLocaleString('id-ID')} dtk` : ''}</span></div><time dateTime={a.at}>{formatDate(a.at,tz,true)}</time><ChevronDownIcon/></summary><div className="event-detail"><span className="mono">ID: {a.id}{a.runId ? ` · Run: ${a.runId}` : ''}</span><pre>{a.detail || 'Tidak ada detail teknis tambahan untuk peristiwa ini.'}</pre></div></details>)}</section>) : <Empty title={state.activities.length ? 'Tidak ada aktivitas yang cocok.' : 'Belum ada jejak aktivitas.'} text={state.activities.length ? 'Ubah pencarian atau filter untuk melihat peristiwa lain.' : 'Koneksi, sinkronisasi, dan tindakan lokal akan tercatat di sini. Tidak ada riwayat buatan.'}/>}</section>}
        {page === 'settings' && <div className="settings-page"><CompletionObserver status={state.completion}/><AgentWorkspace info={state.agentWorkspace} timezone={tz} call={call}/><section className="settings-section"><div className="section-icon"><ShieldCheckIcon/></div><div className="settings-content"><h2>Koneksi yang tetap milik Anda.</h2><p>Masuk langsung di halaman PES dalam jendela koneksi terpisah. PES tidak meminta, membaca, atau menyimpan kata sandi Anda.</p><div className="connection-card"><span className={`connection-dot ${state.connection === 'connected' ? 'connected' : ''}`}/><strong>{connectionLabel}</strong><button className="button" data-testid="connection-button" onClick={() => void call(() => window.pes.openConnection())}>Masuk ke PES <ArrowTopRightOnSquareIcon/></button></div><dl className="settings-facts"><div><dt>Snapshot tersedia</dt><dd>{sourceLabel}</dd></div><div><dt>Sinkron berhasil terakhir</dt><dd>{state.snapshot?.source === 'live' ? formatDate(state.snapshot.retrievedAt,tz,true) : 'Belum tercatat · impor bukan sinkron langsung'}</dd></div><div><dt>Upaya terakhir</dt><dd>{formatDate(state.lastAttemptAt,tz,true)}</dd></div></dl>{state.lastError && <p className="error-note">Upaya terakhir gagal: {interfaceCopy(state.lastError)}. Snapshot sebelumnya tetap tersedia.</p>}</div></section><section className="settings-section"><div className="section-icon"><SunIcon/></div><div className="settings-content"><h2>Tampilan & ritme.</h2><label className="setting-row"><div><strong>Tema</strong><span>Pilih warna dan nuansa yang nyaman untuk bekerja.</span></div><select data-testid="theme-select" aria-label="Tema" value={state.settings.theme} onChange={e => updateSettings({theme:e.target.value as Settings['theme']})}><option value="pinkish">Pinkish (Sakura & Rose)</option><option value="dark">Aurelia Gelap</option><option value="light">Aurelia Terang</option><option value="system">Ikuti sistem</option><option value="catppuccin">Catppuccin (Mocha)</option><option value="everforest">Everforest (Warm Green)</option><option value="solarized">Solarized (Cyan & Teal)</option><option value="github">GitHub (Dimmed)</option><option value="nous">Nous (Electric Blue)</option><option value="nous-alt">Nous Alt (Navy & Cream)</option><option value="midnight">Midnight (Neon Violet)</option><option value="ember">Ember (Terracotta)</option><option value="cyberpunk">Cyberpunk (Matrix Green)</option><option value="slate">Slate (Steel Blue)</option><option value="mono">Monochrome (Minimal)</option></select></label><label className="setting-row"><div><strong>Daftar lebih ringkas</strong><span>Jarak antar tasks lebih rapat, isi tetap lengkap.</span></div><input className="switch" role="switch" type="checkbox" checked={state.settings.compact} onChange={e => updateSettings({compact:e.target.checked})}/></label><label className="setting-row"><div><strong>Zona waktu</strong><span>Untuk tanggal, hitung mundur, dan batas hari.</span></div><select aria-label="Zona waktu" value={tz} onChange={e => updateSettings({timezone:e.target.value})}>{timezones.map(zone => <option key={zone}>{zone}</option>)}</select></label><p className="convention-note"><ClockIcon/>PES menyediakan tanggal, bukan jam tenggat. Aplikasi menghitung hingga tengah malam berikutnya di {tz}; ini konvensi lokal, bukan kebijakan waktu server PES.</p></div></section><section className="settings-section"><div className="section-icon"><FunnelIcon/></div><div className="settings-content"><h2>Cakupan yang jelas.</h2><p>Sinkronisasi manual, baca-saja. Rentang dihitung setiap proses: awal bulan sebelumnya sampai akhir bulan berikutnya.</p><dl className="settings-facts"><div><dt>Rentang proses berikutnya</dt><dd>{scope.from} — {scope.to}</dd></div><div><dt>Status sumber</dt><dd>Approval dan Open</dd></div><div><dt>PIC</dt><dd>MUHAMMAD HERNANDA</dd></div><div><dt>Departemen</dt><dd>IT Mitra Seribu Saudara</dd></div>{state.snapshot && <div><dt>Cakupan snapshot tersimpan</dt><dd>{state.snapshot.scope.from} — {state.snapshot.scope.to}</dd></div>}</dl><p className="subtle-note">Sematan dan fokus adalah preferensi lokal. Tidak ada perubahan status, pengiriman data tasks, atau sinkronisasi otomatis.</p></div></section><footer className="settings-footer">Aurelia <span>A personal agentic task management · data tersimpan di perangkat</span></footer></div>}
      </main>
      {page === 'tasks' && isDetailOpen && <><div className={`detail-backdrop ${selectedId ? 'open' : ''}`} onClick={closeDetail}/><aside className={`detail-pane ${selectedId ? 'open' : ''}`} style={{width:`${detailWidth}px`,flex:`0 0 ${detailWidth}px`,minWidth:'280px',maxWidth:'min(900px, calc(100vw - 220px))'}} aria-label="Detail tasks"><div className={`detail-resize-handle ${isResizing ? 'is-resizing' : ''}`} data-testid="detail-resize-handle" role="separator" aria-orientation="vertical" aria-label="Ubah lebar detail tasks" title="Tarik untuk mengubah lebar panel" aria-valuenow={detailWidth} aria-valuemin={280} aria-valuemax={900} tabIndex={0} onPointerDown={onResizePointerDown} onMouseDown={onResizePointerDown} onDoubleClick={onResizeDoubleClick} onKeyDown={onResizeKeyDown}/><header className="detail-header"><span className="eyebrow">KONTEKS TASKS</span><IconButton label="Tutup detail tasks" data-testid="detail-close" onClick={closeDetail}><XMarkIcon/></IconButton></header>{selected ? <TaskDetail task={selected} state={state} now={now} timezone={tz} call={call}/> : selectedId ? <Empty title="Tasks tidak ada di snapshot ini." text={`Pilihan ${selectedId} tidak diganti dengan tasks lain. Perubahan cakupan bukan bukti bahwa tasks sudah selesai.`}/> : <div className="detail-placeholder"><div className="detail-art"><QueueListIcon/><span/><span/><span/></div><h2>Satu tasks.<br/>Konteks utuh.</h2><p>Pilih tasks untuk melihat tujuan, tenggat, dan riwayat aslinya.</p><div className="keyboard-hint"><kbd>↑</kbd><kbd>↓</kbd><span>Jelajahi daftar</span></div><div className="local-note"><ShieldCheckIcon/><span>Fokus dan sematan hanya untuk Anda. Status PES tidak diubah.</span></div></div>}</aside></>}
    </div>}
    {toast && <div className={`toast ${toast.error ? 'error' : ''}`} role={toast.error ? 'alert' : 'status'}>{toast.error ? <ExclamationTriangleIcon/> : <CheckIcon/>}<span>{toast.text}</span><IconButton label="Tutup pesan" onClick={() => setToast(null)}><XMarkIcon/></IconButton></div>}
    {clearConfirm && <div className="modal-backdrop" onClick={() => setClearConfirm(false)}><section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="clear-title" aria-describedby="clear-description" onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Tab') { const nodes = e.currentTarget.querySelectorAll<HTMLButtonElement>('button'); if (e.shiftKey && document.activeElement === nodes[0]) {e.preventDefault();nodes[nodes.length - 1].focus();} else if (!e.shiftKey && document.activeElement === nodes[nodes.length - 1]) {e.preventDefault();nodes[0].focus();} } }}><TrashIcon/><h2 id="clear-title">Hapus riwayat aktivitas?</h2><p id="clear-description">Semua aktivitas tersimpan akan dihapus. Snapshot tasks, sematan, dan pilihan fokus tidak berubah.</p><div className="dialog-actions"><button autoFocus className="button" onClick={() => setClearConfirm(false)}>Batal</button><button className="button danger-button" onClick={() => void call(async () => {await window.pes.clearActivity();setClearConfirm(false);},'Riwayat aktivitas dihapus.')}>Hapus riwayat</button></div></section></div>}
  </div>;
}

function TaskDetail({ task, state, now, timezone, call }: {task:Task;state:AppState;now:Date;timezone:string;call:(action:()=>Promise<unknown>,success?:string)=>Promise<void>}) {
  const deadline = taskDeadlineInfo(task, now, timezone);
  const remaining = Math.abs(deadline.remainingMs ?? 0); const hours = Math.floor(remaining / 3600000), minutes = Math.floor((remaining % 3600000) / 60000);
  const focused = state.focusTaskId === task.TaskNo;
  const workspaceError = workspaceUnavailable(state.agentWorkspace);
  const [finishDate, setFinishDate] = useState<string>(task.Duedate || '');
  const [evidencePath, setEvidencePath] = useState<string>('');
  const [evidenceName, setEvidenceName] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);

  const handleChooseEvidence = async () => {
    try {
      const file = await window.pes.selectEvidenceFile();
      if (file) {
        setEvidencePath(file);
        setEvidenceName(file.split(/[/\\]/).pop() || file);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      void call(async () => {}, msg);
    }
  };

  const handleAutoEvidence = async () => {
    try {
      const res = await window.pes.generateEvidence(task.TaskNo);
      if (res && res.filePath) {
        setEvidencePath(res.filePath);
        setEvidenceName(res.fileName);
        void call(async () => {}, `Bukti otomatis siap: ${res.fileName}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      void call(async () => {}, msg);
    }
  };

  const handleCompleteTask = async () => {
    if (submitting) return;
    const targetDate = finishDate.trim() || task.Duedate;
    if (!targetDate) return;
    setSubmitting(true);
    try {
      await call(async () => {
        const res = await window.pes.finishTask(task.TaskNo, targetDate, evidencePath || undefined);
        if (!res.success) throw new Error(res.error || 'Penyelesaian task gagal.');
      }, `Task ${task.TaskNo} berhasil diselesaikan di PES!`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      void call(async () => {}, msg);
    } finally {
      setSubmitting(false);
    }
  };

  return <div className="detail-scroll" key={task.TaskNo}>
    <div className="detail-id"><span className="mono">{task.TaskNo}</span><span className="status-pill">{task.Status}</span></div>
    <h2 className="detail-title">{task.TaskName || 'Nama tasks tidak tersedia'}</h2>
    <div className="detail-actions">
      <button className={`button ${focused ? 'focus-active' : 'primary'}`} onClick={() => void call(() => window.pes.setFocus(focused ? null : task.TaskNo))}><BoltIcon/>{focused ? 'Lepas fokus' : 'Fokus berikutnya'}</button>
      <IconButton label={state.preferences[task.TaskNo]?.pinned ? 'Lepas sematan tasks' : 'Sematkan tasks'} active={!!state.preferences[task.TaskNo]?.pinned} onClick={() => void call(() => window.pes.togglePin(task.TaskNo))}><StarIcon/></IconButton>
    </div>
    <div className={`deadline-card ${deadline.kind}`}>
      <div><ClockIcon/><strong>{deadline.label}</strong></div>
      <span className="countdown">{deadline.kind === 'completed' ? (task.Status === 'Update Task' ? 'Task telah di-submit ke PES dan menunggu approval atasan.' : `Task telah diselesaikan pada ${task.TglSelesai || task.Duedate || 'tanggal tercatat'}.`) : deadline.kind === 'unknown' ? 'Tanggal belum tersedia' : deadline.kind === 'overdue' ? `${deadline.days} hari kalender melewati target (${task.Target})` : `${hours.toLocaleString('id-ID')} jam ${minutes} menit menuju batas hari`}</span>
      <p>{deadline.detail}</p>
    </div>
    <section className="detail-section pes-completion-section" data-testid="pes-completion-card">
      <h3>Penyelesaian Portal PES</h3>
      {task.Status === 'Selesai' || task.Status === 'Solved' ? (
        <div className="pes-completed-banner">
          <CheckIcon />
          <div>
            <strong>Task ini sudah selesai di PES</strong>
            <p>Status: {task.Status} · Tanggal selesai: {task.TglSelesai || task.Duedate || 'Tercatat'}</p>
          </div>
        </div>
      ) : (
        <div className="pes-completion-card">
          <label className="pes-input-label">
            <span>Tanggal Selesai</span>
            <input
              type="text"
              className="pes-date-input"
              data-testid="pes-finish-date-input"
              value={finishDate}
              onChange={e => setFinishDate(e.target.value)}
              placeholder="DD-Mmm-YYYY"
            />
          </label>
          <div className="pes-evidence-row">
            <span className="pes-field-title">Bukti Lampiran (Wajib di PES)</span>
            <div className="pes-evidence-display">
              <span className="mono">{evidenceName || 'Bukti otomatis (disiapkan saat kirim)'}</span>
            </div>
            <div className="pes-evidence-btns">
              <button type="button" className="button" data-testid="pes-choose-file-btn" onClick={handleChooseEvidence}>Pilih File…</button>
              <button type="button" className="button" data-testid="pes-auto-evidence-btn" onClick={handleAutoEvidence} title="Buat dokumen bukti teks otomatis">Buat Otomatis</button>
            </div>
          </div>
          <button
            type="button"
            className="button primary pes-complete-btn"
            data-testid="pes-submit-complete-btn"
            disabled={submitting}
            onClick={handleCompleteTask}
          >
            <ArrowPathIcon className={submitting ? 'spin asana-icon-xs' : 'asana-icon-xs'} />
            <span>{submitting ? 'Mengirim ke PES…' : 'Kirim Selesai ke PES'}</span>
          </button>
        </div>
      )}
    </section>
    <section className="detail-section"><h3>Tujuan tasks</h3><p className="source-text">{task.GoalTask || 'Tujuan belum tersedia pada sumber.'}</p></section>
    <section className="detail-section"><h3>Informasi sumber</h3><dl className="source-fields">{fields.map(({key,name}) => <div key={key}><dt>{name}</dt><dd>{String(task[key] ?? '') || '—'}</dd></div>)}</dl></section>
    <section className="detail-section history-section"><h3>Riwayat target</h3><p className="subtle-note">Status riwayat (misalnya Verifikasi) berbeda dari status daftar {task.Status}.</p><pre className="history-text">{task.history?.text || 'Teks riwayat tidak tersedia.'}</pre>{task.history?.tables?.map((table,i) => <div className="history-table-wrap" key={i}><table aria-label={`Tabel riwayat target ${i + 1}`}><tbody>{table.map((row,j) => <tr key={j}>{row.map((cell,k) => <td key={k}>{cell}</td>)}</tr>)}</tbody></table></div>)}</section>
    <section className="detail-section provenance"><ShieldCheckIcon/><div><strong>{state.snapshot?.source === 'imported' ? 'Snapshot historis diimpor' : 'Snapshot hasil sinkronisasi'}</strong><p>{formatDate(state.snapshot?.retrievedAt,timezone,true)}. Teks sumber ditampilkan apa adanya; preferensi lokal disimpan terpisah.</p></div></section>
    <section className="detail-section task-workspace-actions" aria-label="Agent context tasks"><h3>Agent workspace</h3><div className="workspace-actions"><button type="button" className="button" data-testid="task-workspace-open" disabled={!!workspaceError} aria-describedby={workspaceError ? 'task-workspace-status' : undefined} onClick={() => void call(() => window.pes.openAgentWorkspace(task.TaskNo))}><ArrowTopRightOnSquareIcon/>Open task workspace</button><button type="button" className="button" data-testid="copy-agent-context" disabled={!!workspaceError} aria-describedby={workspaceError ? 'task-workspace-status' : undefined} onClick={() => void call(() => window.pes.copyTaskContext(task.TaskNo),'Agent context disalin.')}><DocumentDuplicateIcon/>Copy agent context</button></div>{workspaceError && <p id="task-workspace-status" className={state.agentWorkspace?.error ? 'error-note' : 'subtle-note'} role={state.agentWorkspace?.error ? 'alert' : 'status'}>{workspaceError}</p>}</section>
    <div className="detail-tools"><button className="button" onClick={() => void call(() => window.pes.copyText(task.TaskNo),'Nomor tasks disalin.')}><DocumentDuplicateIcon/>Salin nomor</button><button className="button" onClick={() => void call(() => window.pes.copyText(taskText(task)),'Detail tasks disalin.')}><DocumentDuplicateIcon/>Salin detail</button><button className="button" onClick={() => void call(() => window.pes.exportTasks('json',task.TaskNo))}><ArrowDownTrayIcon/>Ekspor JSON</button><button className="button" onClick={() => void call(() => window.pes.exportTasks('csv',task.TaskNo))}><ArrowDownTrayIcon/>Ekspor CSV</button></div>
    <button className="text-button open-pes" onClick={() => void call(() => window.pes.openPes())}>Buka halaman tasks PES <ArrowTopRightOnSquareIcon/></button>
    <p className="subtle-note">Membuka halaman daftar PES, bukan tautan langsung ke tasks.</p>
  </div>;
}
