import {ShieldCheckIcon} from '@heroicons/react/24/outline';
import type {CompletionObservation} from '../shared/completion-observation';

/** Informational only: deliberately no callback, button or mutation API. */
export function CompletionObserver({status}:{status:CompletionObservation|undefined}){
 return <section className="settings-section" data-testid="completion-observer" aria-labelledby="completion-observer-title">
  <div className="section-icon"><ShieldCheckIcon/></div><div className="settings-content">
   <h2 id="completion-observer-title">Penyelesaian tasks oleh agent</h2>
   <p><strong>Hanya agent · assessment-only</strong></p>
   <p>Enrolmen agent belum terverifikasi. Penyelesaian PES dinonaktifkan. Agent dapat menilai kesiapan melalui adapter baca-saja; tombol Sinkronkan tidak menyelesaikan tasks.</p>
   <dl className="settings-facts">
    <div><dt>Penulisan PES</dt><dd>Nonaktif · tidak ada pemicu penyelesaian manual</dd></div>
    <div><dt>Jurnal lokal</dt><dd>{status?.journalAvailable?'Tersedia':'Tidak tersedia · gagal tertutup'}</dd></div>
    <div><dt>Operasi tercatat</dt><dd>{status?.journalAvailable?status.operationCount:'Tidak diketahui'}</dd></div>
    <div><dt>Operasi perlu rekonsiliasi</dt><dd>{status?.journalAvailable?status.unresolvedCount:'Tidak diketahui'}</dd></div>
    <div><dt>Status sumber “Update Task”</dt><dd>{status?.intermediateTaskCount??'Tidak diketahui · seluruh baris sumber belum tersedia'}</dd></div>
   </dl>
   {status?.recent.length ? <ul>{status.recent.map(item=><li key={item.operationId}><span className="mono">{item.taskNo}</span> · {item.state}</li>)}</ul>:null}
   <p className="subtle-note">Status daftar, tanggal selesai, dan riwayat PES dipertahankan apa adanya. Perbedaan antar tampilan tidak diubah menjadi klaim selesai. Adapter yang dibuat belum otomatis terhubung ke Hermes.</p>
   {status?.reasonCodes.length ? <p className="mono subtle-note">{status.reasonCodes.join(' · ')}</p>:null}
  </div>
 </section>;
}
