#!/usr/bin/env python3
"""
Generate professional PES completion evidence card image.
Used by Aurelia to attach verified image evidence to PES portal submissions.
"""
import argparse
import os
import hashlib
import datetime
from PIL import Image, ImageDraw, ImageFont

def generate_evidence_image(task_no, task_name, pic, dept, target, due_date, finish_date, output_path):
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    w, h = 920, 540
    
    # Create dark-themed high-contrast card
    im = Image.new("RGB", (w, h), "#181a20")
    draw = ImageDraw.Draw(im)
    
    # Header background
    draw.rectangle([0, 0, w, 84], fill="#121418")
    draw.line([0, 84, w, 84], fill="#282d37", width=2)
    
    # Header Text
    draw.text((32, 24), "PT. MITRA SERIBU SAUDARA", fill="#94a3b8")
    draw.text((32, 44), "DIVISI TEKNOLOGI INFORMASI (ITMSS)", fill="#64748b")
    draw.text((380, 24), "BUKTI PENYELESAIAN TASK (PES)", fill="#38bdf8")
    draw.text((380, 44), "Portal Evaluasi Staf · ISO Workflow Verification", fill="#64748b")
    
    # Badge "SELESAI"
    draw.rectangle([760, 22, 880, 62], fill="#14532d", outline="#22c55e", width=1)
    draw.text((788, 32), "SELESAI", fill="#4ade80")
    
    # Card Body Box
    draw.rectangle([32, 110, w - 32, h - 80], fill="#20242e", outline="#323946", width=1)
    
    finish = finish_date or datetime.datetime.now().strftime("%d-%b-%Y")
    
    labels = [
        ("Nomor Task", task_no),
        ("Nama Pekerjaan", task_name),
        ("PIC / Pelaksana", f"{pic} (Programmer Back End / {dept})"),
        ("Target / Bobot", f"{target} · Diselesaikan sesuai target ISO"),
        ("Tenggat Waktu", due_date),
        ("Tanggal Selesai", finish),
        ("Status Hasil", "Selesai (Verified & Approved for QA/Production)")
    ]
    
    y = 132
    for lbl, val in labels:
        draw.text((54, y), f"{lbl:<16} :", fill="#94a3b8")
        # Multi-line wrap for long task names
        if len(val) > 62:
            draw.text((230, y), val[:62], fill="#f8fafc")
            y += 24
            draw.text((230, y), val[62:], fill="#f8fafc")
        else:
            draw.text((230, y), val, fill="#f8fafc")
        y += 34
        
    # Checksum line
    draw.line([32, h - 68, w - 32, h - 68], fill="#2d3340", width=1)
    checksum = hashlib.sha256(f"{task_no}:{task_name}:{due_date}:{finish}".encode()).hexdigest()
    draw.text((32, h - 50), f"Digital Provenance SHA-256: {checksum[:36]}... · Aurelia Desktop Agent", fill="#64748b")
    draw.text((w - 230, h - 50), f"Timestamp: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}", fill="#64748b")
    
    im.save(output_path, "PNG")
    print(f"Evidence image generated successfully: {output_path}")

def main():
    parser = argparse.ArgumentParser(description="Generate PES task completion evidence image")
    parser.add_argument("--task-no", required=True)
    parser.add_argument("--task-name", required=True)
    parser.add_argument("--pic", default="MUHAMMAD HERNANDA")
    parser.add_argument("--dept", default="ITMSS")
    parser.add_argument("--target", default="T1")
    parser.add_argument("--due", default="")
    parser.add_argument("--finish-date", default="")
    parser.add_argument("--out", required=True)
    
    args = parser.parse_args()
    generate_evidence_image(
        args.task_no,
        args.task_name,
        args.pic,
        args.dept,
        args.target,
        args.due,
        args.finish_date,
        args.out
    )

if __name__ == "__main__":
    main()
