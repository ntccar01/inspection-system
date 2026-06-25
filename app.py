from flask import Flask, render_template, request, jsonify, redirect, url_for, session
from datetime import datetime, date, timedelta
from functools import wraps
import sqlite3
import os
import socket
import webbrowser
import threading

from learning_data import WEEKS, GOOGLE_SHEET_EMBED_URL

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', os.urandom(24))
BASE = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.environ.get('DB_PATH', os.path.join(BASE, 'inspection.db'))
ADMIN_PASSWORD = os.environ.get('ADMIN_PWD', 'admin123')


def admin_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not session.get('is_admin'):
            return redirect(url_for('admin_login', next=request.url))
        return f(*args, **kwargs)
    return decorated


@app.context_processor
def inject_admin():
    return dict(is_admin=session.get('is_admin', False))


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    conn = get_db()
    c = conn.cursor()
    c.executescript('''
        CREATE TABLE IF NOT EXISTS time_slots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            label TEXT NOT NULL UNIQUE,
            display_order INTEGER NOT NULL,
            max_capacity INTEGER DEFAULT 4,
            is_active INTEGER DEFAULT 1
        );
        CREATE TABLE IF NOT EXISTS vehicles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            license_plate TEXT NOT NULL UNIQUE,
            owner_name TEXT NOT NULL,
            phone TEXT NOT NULL,
            vehicle_type TEXT DEFAULT '自用小客車',
            manufacture_year INTEGER,
            last_inspection TEXT,
            next_inspection TEXT,
            notes TEXT,
            created_at TEXT DEFAULT (datetime('now','localtime'))
        );
        CREATE TABLE IF NOT EXISTS reservations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            vehicle_id INTEGER,
            license_plate TEXT NOT NULL,
            owner_name TEXT NOT NULL,
            phone TEXT NOT NULL,
            vehicle_type TEXT DEFAULT '自用小客車',
            reserve_date TEXT NOT NULL,
            time_slot TEXT NOT NULL,
            status TEXT DEFAULT '已預約'
                CHECK(status IN ('已預約','已報到','檢驗中','已完成','未通過','覆驗','未到','已取消')),
            check_in_time TEXT,
            complete_time TEXT,
            notes TEXT,
            created_at TEXT DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (vehicle_id) REFERENCES vehicles(id)
        );
        CREATE INDEX IF NOT EXISTS idx_reservations_date
            ON reservations(reserve_date, time_slot);
        CREATE INDEX IF NOT EXISTS idx_vehicles_plate
            ON vehicles(license_plate);
        CREATE TABLE IF NOT EXISTS learning_progress (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            week_number INTEGER NOT NULL,
            group_name TEXT NOT NULL,
            student_names TEXT DEFAULT '',
            status TEXT DEFAULT '未開始'
                CHECK(status IN ('未開始','進行中','已完成')),
            notes TEXT DEFAULT '',
            updated_at TEXT DEFAULT (datetime('now','localtime')),
            UNIQUE(week_number, group_name)
        );
    ''')

    count = c.execute('SELECT COUNT(*) FROM time_slots').fetchone()[0]
    if count == 0:
        slots = [
            ('09:00-10:00', 1, 4),
            ('10:00-11:00', 2, 4),
            ('11:00-12:00', 3, 3),
            ('13:30-14:30', 4, 4),
            ('14:30-15:30', 5, 4),
            ('15:30-16:30', 6, 3),
        ]
        c.executemany(
            'INSERT INTO time_slots (label, display_order, max_capacity) VALUES (?,?,?)',
            slots
        )

    vcount = c.execute('SELECT COUNT(*) FROM vehicles').fetchone()[0]
    if vcount == 0:
        sample_vehicles = [
            ('ABC-1234', '王大明', '0912-345-678', '自用小客車', 2014, '2025-12-15', '2026-12-15', ''),
            ('KLD-8899', '林美玲', '0988-222-123', '自用小客車', 2019, '2026-01-10', '2027-01-10', ''),
            ('TX-5678', '陳建宏', '0975-111-888', '自用小貨車', 2012, '2025-11-20', '2026-05-20', ''),
            ('NQH-2301', '黃雅婷', '0933-876-655', '自用小客車', 2020, '2026-03-05', '2027-03-05', ''),
            ('BMW-5201', '張志豪', '0958-333-777', '自用小客車', 2016, '2026-02-28', '2026-08-28', ''),
            ('CF-8866', '李淑芬', '0921-456-789', '自用小客車', 2022, '2026-04-12', '2027-04-12', ''),
            ('NVH-3721', '吳國榮', '0963-111-222', '自用小貨車', 2010, '2025-09-01', '2026-03-01', ''),
            ('RKT-9955', '許美惠', '0972-888-333', '營業小客車', 2018, '2026-03-20', '2026-09-20', ''),
        ]
        c.executemany(
            'INSERT INTO vehicles (license_plate, owner_name, phone, vehicle_type, manufacture_year, last_inspection, next_inspection, notes) VALUES (?,?,?,?,?,?,?,?)',
            sample_vehicles
        )

    rcount = c.execute('SELECT COUNT(*) FROM reservations').fetchone()[0]
    if rcount == 0:
        today = date.today().isoformat()
        sample_reservations = [
            ('ABC-1234', '王大明', '0912-345-678', '自用小客車', today, '09:00-10:00', '已報到', '08:45', None, ''),
            ('KLD-8899', '林美玲', '0988-222-123', '自用小客車', today, '10:00-11:00', '檢驗中', '09:50', None, ''),
            ('TX-5678', '陳建宏', '0975-111-888', '自用小貨車', today, '10:00-11:00', '檢驗中', '10:05', None, '十年以上車輛'),
            ('NQH-2301', '黃雅婷', '0933-876-655', '自用小客車', today, '14:30-15:30', '已預約', None, None, ''),
            ('BMW-5201', '張志豪', '0958-333-777', '自用小客車', today, '11:00-12:00', '已完成', '10:30', '11:45', ''),
            ('RKT-9955', '許美惠', '0972-888-333', '營業小客車', today, '09:00-10:00', '已完成', '09:00', '09:55', ''),
            ('ABC-1234', '王大明', '0912-345-678', '自用小客車', (date.today() + timedelta(days=3)).isoformat(), '09:00-10:00', '已預約', None, None, ''),
        ]
        for r in sample_reservations:
            c.execute(
                'INSERT INTO reservations (license_plate, owner_name, phone, vehicle_type, reserve_date, time_slot, status, check_in_time, complete_time, notes) VALUES (?,?,?,?,?,?,?,?,?,?)',
                r
            )

    conn.commit()
    conn.close()


def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return '127.0.0.1'


def get_slot_status(target_date):
    conn = get_db()
    slots = conn.execute(
        'SELECT * FROM time_slots WHERE is_active=1 ORDER BY display_order'
    ).fetchall()

    results = []
    for slot in slots:
        count = conn.execute(
            'SELECT COUNT(*) FROM reservations WHERE reserve_date=? AND time_slot=? AND status NOT IN ("未到","已取消")',
            (target_date, slot['label'])
        ).fetchone()[0]
        pct = min(int(count / slot['max_capacity'] * 100), 100)
        if pct >= 90:
            label, tone = '滿載', 'full'
        elif pct >= 70:
            label, tone = '忙碌', 'busy'
        elif pct >= 45:
            label, tone = '普通', 'normal'
        else:
            label, tone = '空閒', 'open'
        results.append({
            'label': slot['label'],
            'order': slot['display_order'],
            'count': count,
            'max': slot['max_capacity'],
            'pct': pct,
            'status_label': label,
            'status_tone': tone,
        })
    conn.close()
    return results


def get_today_stats(target_date):
    conn = get_db()
    total = conn.execute(
        'SELECT COUNT(*) FROM reservations WHERE reserve_date=? AND status NOT IN ("已取消")',
        (target_date,)
    ).fetchone()[0]
    checked_in = conn.execute(
        'SELECT COUNT(*) FROM reservations WHERE reserve_date=? AND status IN ("已報到","檢驗中")',
        (target_date,)
    ).fetchone()[0]
    inspecting = conn.execute(
        'SELECT COUNT(*) FROM reservations WHERE reserve_date=? AND status="檢驗中"',
        (target_date,)
    ).fetchone()[0]
    completed = conn.execute(
        'SELECT COUNT(*) FROM reservations WHERE reserve_date=? AND status IN ("已完成","已離場")',
        (target_date,)
    ).fetchone()[0]
    no_show = conn.execute(
        'SELECT COUNT(*) FROM reservations WHERE reserve_date=? AND status="未到"',
        (target_date,)
    ).fetchone()[0]
    conn.close()
    return {
        'total': total, 'checked_in': checked_in,
        'inspecting': inspecting, 'completed': completed,
        'no_show': no_show,
    }


def search_vehicle(keyword):
    conn = get_db()
    rows = conn.execute(
        'SELECT * FROM vehicles WHERE license_plate LIKE ? OR owner_name LIKE ? OR phone LIKE ? LIMIT 20',
        (f'%{keyword}%', f'%{keyword}%', f'%{keyword}%')
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_vehicle_by_plate(plate):
    conn = get_db()
    row = conn.execute(
        'SELECT * FROM vehicles WHERE license_plate=?', (plate,)
    ).fetchone()
    conn.close()
    return dict(row) if row else None


# ─── 學習歷程 ─────────────────────────────────────────────

@app.route('/learning')
def learning_hub():
    conn = get_db()
    rows = conn.execute('SELECT week_number, status, COUNT(*) as cnt FROM learning_progress GROUP BY week_number, status').fetchall()
    conn.close()
    stats = {}
    for row in rows:
        w = row['week_number']
        if w not in stats:
            stats[w] = {'completed': 0, 'in_progress': 0, 'not_started': 0}
        if row['status'] == '已完成':
            stats[w]['completed'] = row['cnt']
        elif row['status'] == '進行中':
            stats[w]['in_progress'] = row['cnt']
        else:
            stats[w]['not_started'] = row['cnt']
    return render_template('learning_hub.html', weeks=WEEKS, progress_stats=stats)


@app.route('/learning/week/<int:week>')
def learning_week(week):
    if week < 1 or week > 20:
        return redirect(url_for('learning_hub'))
    data = WEEKS.get(week)
    if not data:
        return redirect(url_for('learning_hub'))
    return render_template('learning_week.html', week=week, data=data)


@app.route('/learning/progress')
def learning_progress():
    conn = get_db()
    rows = conn.execute('SELECT * FROM learning_progress ORDER BY week_number, group_name').fetchall()
    conn.close()
    progress = {}
    for row in rows:
        w = row['week_number']
        if w not in progress:
            progress[w] = []
        progress[w].append(dict(row))
    return render_template('learning_progress.html', progress=progress, weeks=WEEKS)


@app.route('/admin/learning-progress')
@admin_required
def admin_learning_progress():
    conn = get_db()
    rows = conn.execute('SELECT * FROM learning_progress ORDER BY week_number, group_name').fetchall()
    conn.close()
    progress = {}
    for row in rows:
        w = row['week_number']
        if w not in progress:
            progress[w] = []
        progress[w].append(dict(row))
    groups = ['第1組', '第2組', '第3組', '第4組', '第5組', '第6組']
    return render_template('admin_learning_progress.html', progress=progress, weeks=WEEKS, groups=groups)


@app.route('/api/learning-progress', methods=['POST'])
@admin_required
def api_update_learning_progress():
    data = request.get_json()
    week = data.get('week_number')
    group = data.get('group_name')
    status = data.get('status', '未開始')
    notes = data.get('notes', '')
    students = data.get('student_names', '')
    if not week or not group:
        return jsonify({'error': '缺少週次或組別'}), 400
    conn = get_db()
    conn.execute('''
        INSERT INTO learning_progress (week_number, group_name, student_names, status, notes)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(week_number, group_name)
        DO UPDATE SET status=?, notes=?, student_names=?, updated_at=datetime('now','localtime')
    ''', (week, group, students, status, notes, status, notes, students))
    conn.commit()
    conn.close()
    return jsonify({'message': '更新成功'})



# ─── 管理員登入 ─────────────────────────────────────────────

@app.route('/admin/login', methods=['GET', 'POST'])
def admin_login():
    error = None
    if request.method == 'POST':
        if request.form.get('password') == ADMIN_PASSWORD:
            session['is_admin'] = True
            next_url = request.args.get('next') or url_for('dashboard')
            return redirect(next_url)
        error = '密碼錯誤，請重新輸入'
    return render_template('login.html', error=error)


@app.route('/admin/logout')
def admin_logout():
    session.pop('is_admin', None)
    return redirect(url_for('index'))


# ─── 頁面路由（公開） ───────────────────────────────────────

@app.route('/')
def index():
    today = date.today().isoformat()
    slots = get_slot_status(today)
    stats = get_today_stats(today)
    return render_template('index.html', slots=slots, stats=stats, today=today)


@app.route('/reserve')
def reserve_page():
    today = date.today().isoformat()
    return render_template('reserve.html', today=today)


@app.route('/reserve/success')
def reserve_success():
    rid = request.args.get('id', '')
    plate = request.args.get('plate', '')
    slot = request.args.get('slot', '')
    return render_template('success.html', rid=rid, plate=plate, slot=slot)


@app.route('/dashboard')
@admin_required
def dashboard():
    today = date.today().isoformat()
    slots = get_slot_status(today)
    stats = get_today_stats(today)
    conn = get_db()
    rows = conn.execute(
        'SELECT * FROM reservations WHERE reserve_date=? ORDER BY '
        'CASE status WHEN "檢驗中" THEN 0 WHEN "已報到" THEN 1 WHEN "已預約" THEN 2 ELSE 3 END, '
        'time_slot',
        (today,)
    ).fetchall()
    conn.close()
    reservations = [dict(r) for r in rows]
    return render_template('dashboard.html', slots=slots, stats=stats, reservations=reservations, today=today)


@app.route('/vehicles')
@admin_required
def vehicles_page():
    conn = get_db()
    rows = conn.execute('SELECT * FROM vehicles ORDER BY license_plate').fetchall()
    conn.close()
    return render_template('vehicles.html', vehicles=[dict(r) for r in rows])


@app.route('/public')
def public_board():
    today = date.today().isoformat()
    slots = get_slot_status(today)
    return render_template('public.html', slots=slots, today=today)

# ─── API 路由 ─────────────────────────────────────────────

@app.route('/api/public/vehicle-lookup')
def api_public_vehicle_lookup():
    plate = request.args.get('plate', '').strip().upper()
    if len(plate) < 3:
        return jsonify({})
    conn = get_db()
    row = conn.execute(
        'SELECT vehicle_type, manufacture_year FROM vehicles WHERE license_plate=?',
        (plate,)
    ).fetchone()
    conn.close()
    if row:
        return jsonify({
            'vehicle_type': row['vehicle_type'],
            'manufacture_year': row['manufacture_year'],
        })
    return jsonify({})


@app.route('/api/slots')
def api_slots():
    target = request.args.get('date', date.today().isoformat())
    return jsonify(get_slot_status(target))


@app.route('/api/stats')
def api_stats():
    target = request.args.get('date', date.today().isoformat())
    return jsonify(get_today_stats(target))


@app.route('/api/reservations')
def api_reservations():
    target = request.args.get('date', date.today().isoformat())
    conn = get_db()
    rows = conn.execute(
        'SELECT * FROM reservations WHERE reserve_date=? ORDER BY time_slot',
        (target,)
    ).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route('/api/reservations', methods=['POST'])
def api_create_reservation():
    data = request.get_json()
    required = ['license_plate', 'owner_name', 'phone', 'reserve_date', 'time_slot']
    for field in required:
        if not data.get(field, '').strip():
            return jsonify({'error': f'缺少必要欄位：{field}'}), 400

    plate = data['license_plate'].strip().upper()
    conn = get_db()
    vehicle = conn.execute('SELECT id FROM vehicles WHERE license_plate=?', (plate,)).fetchone()
    if vehicle:
        vehicle_id = vehicle['id']
        conn.execute(
            'UPDATE vehicles SET owner_name=?, phone=? WHERE id=?',
            (data['owner_name'], data['phone'], vehicle_id)
        )
    else:
        c = conn.execute(
            'INSERT INTO vehicles (license_plate, owner_name, phone, vehicle_type, manufacture_year) VALUES (?,?,?,?,?)',
            (plate, data['owner_name'], data['phone'], data.get('vehicle_type', '自用小客車'),
             data.get('manufacture_year') or None)
        )
        vehicle_id = c.lastrowid

    existing = conn.execute(
        'SELECT COUNT(*) FROM reservations WHERE reserve_date=? AND time_slot=? AND status NOT IN ("未到","已取消")',
        (data['reserve_date'], data['time_slot'])
    ).fetchone()[0]
    slot_info = conn.execute(
        'SELECT max_capacity FROM time_slots WHERE label=?', (data['time_slot'],)
    ).fetchone()
    if slot_info and existing >= slot_info['max_capacity']:
        conn.close()
        return jsonify({'error': f'時段 {data["time_slot"]} 已滿，請選擇其他時段'}), 400

    c = conn.execute(
        'INSERT INTO reservations (vehicle_id, license_plate, owner_name, phone, vehicle_type, reserve_date, time_slot, status, notes) VALUES (?,?,?,?,?,?,?,?,?)',
        (vehicle_id, plate, data['owner_name'], data['phone'],
         data.get('vehicle_type', '自用小客車'), data['reserve_date'],
         data['time_slot'], '已預約', data.get('notes', ''))
    )
    conn.commit()
    conn.close()
    return jsonify({'id': c.lastrowid, 'message': '預約成功'})


@app.route('/api/reservations/<int:rid>/status', methods=['PUT'])
@admin_required
def api_update_status(rid):
    data = request.get_json()
    new_status = data.get('status')
    valid = ['已預約', '已報到', '檢驗中', '已完成', '未通過', '覆驗', '未到', '已取消']
    if new_status not in valid:
        return jsonify({'error': '無效的狀態'}), 400

    conn = get_db()
    now_str = datetime.now().strftime('%H:%M')
    if new_status == '已報到':
        conn.execute('UPDATE reservations SET status=?, check_in_time=? WHERE id=?', (new_status, now_str, rid))
    elif new_status in ('已完成',):
        conn.execute('UPDATE reservations SET status=?, complete_time=? WHERE id=?', (new_status, now_str, rid))
    else:
        conn.execute('UPDATE reservations SET status=? WHERE id=?', (new_status, rid))
    conn.commit()
    conn.close()
    return jsonify({'message': '更新成功'})


@app.route('/api/reservations/<int:rid>', methods=['DELETE'])
def api_delete_reservation(rid):
    conn = get_db()
    conn.execute('UPDATE reservations SET status="已取消" WHERE id=?', (rid,))
    conn.commit()
    conn.close()
    return jsonify({'message': '已取消'})


@app.route('/api/vehicles/search')
@admin_required
def api_vehicle_search():
    keyword = request.args.get('q', '').strip()
    if not keyword:
        return jsonify([])
    return jsonify(search_vehicle(keyword))


@app.route('/api/vehicles', methods=['POST'])
@admin_required
def api_add_vehicle():
    data = request.get_json()
    plate = data.get('license_plate', '').strip().upper()
    if not plate:
        return jsonify({'error': '請輸入車牌號碼'}), 400
    conn = get_db()
    existing = conn.execute('SELECT id FROM vehicles WHERE license_plate=?', (plate,)).fetchone()
    if existing:
        conn.close()
        return jsonify({'error': '此車牌已存在'}), 400
    conn.execute(
        'INSERT INTO vehicles (license_plate, owner_name, phone, vehicle_type, manufacture_year, notes) VALUES (?,?,?,?,?,?)',
        (plate, data.get('owner_name', ''), data.get('phone', ''), data.get('vehicle_type', '自用小客車'),
         data.get('manufacture_year') or None, data.get('notes', ''))
    )
    conn.commit()
    conn.close()
    return jsonify({'message': '車輛新增成功'})


def open_browser():
    webbrowser.open(f'http://localhost:5000')


if __name__ == '__main__':
    init_db()
    ip = get_local_ip()
    print('─' * 50)
    print('  驗車場智慧預約與流場管理系統')
    print('─' * 50)
    print(f'  本機： http://localhost:5000')
    print(f'  區域網路： http://{ip}:5000')
    print('─' * 50)
    print('  車主端（公開）')
    print('    首頁     → /')
    print('    線上預約 → /reserve')
    print('    公共看板 → /public')
    print('  管理端（需登入）')
    print('    廠內中控 → /dashboard')
    print('    車籍管理 → /vehicles')
    print('    學習進度 → /admin/learning-progress')
    print(f'    管理密碼 → {ADMIN_PASSWORD}')
    print('─' * 50)
    threading.Timer(1.5, open_browser).start()
    app.run(debug=True, host='0.0.0.0', port=5000)
else:
    init_db()
