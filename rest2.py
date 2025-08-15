import os
from datetime import datetime, timedelta
from functools import wraps

from flask import (
    Flask, request, jsonify,
    render_template, send_from_directory
)
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
import jwt
from dotenv import load_dotenv

# ——— Load env ———
load_dotenv()
SECRET_KEY = os.getenv('SECRET_KEY', 'dev-secret-key')
DATABASE_URI = os.getenv('DATABASE_URI', 'sqlite:///tracker.db')

# ——— App Initialization ———
app = Flask(
    __name__,
    static_folder='static',
    template_folder='templates'
)
app.config.update({
    'SECRET_KEY': SECRET_KEY,
    'SQLALCHEMY_DATABASE_URI': DATABASE_URI,
    'SQLALCHEMY_TRACK_MODIFICATIONS': False
})
db = SQLAlchemy(app)

# ——— Models ———
class User(db.Model):
    id            = db.Column(db.Integer, primary_key=True)
    name          = db.Column(db.String(120), nullable=False)
    email         = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(128), nullable=False)
    transactions  = db.relationship('Transaction', backref='user', lazy=True)

class Transaction(db.Model):
    id          = db.Column(db.Integer, primary_key=True)
    user_id     = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    type        = db.Column(db.String(10), nullable=False)  # 'expense' or 'income'
    tag         = db.Column(db.String(50), nullable=False)
    amount      = db.Column(db.Float, nullable=False)
    description = db.Column(db.Text)
    timestamp   = db.Column(db.DateTime, default=datetime.utcnow)

# ——— Helpers ———
def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get('Authorization', '').replace('Bearer ', '')
        if not token:
            return jsonify({'message': 'Token required.'}), 401
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=['HS256'])
            user = User.query.get(payload['user_id'])
            if not user:
                raise RuntimeError()
        except Exception:
            return jsonify({'message': 'Invalid or expired token.'}), 401
        return f(user, *args, **kwargs)
    return decorated

# ——— Template Routes ———
@app.route('/')
def home():
    return render_template('index.html')

@app.route('/sign_in.html')
def sign_in():
    return render_template('sign_in.html')

@app.route('/sign_up.html')
def sign_up():
    return render_template('sign_up.html')

# ——— Auth API ———
@app.route('/api/auth/signup', methods=['POST'])
def signup():
    data = request.get_json()
    if User.query.filter_by(email=data['email']).first():
        return jsonify({'message': 'Email already in use.'}), 400

    user = User(
        name=data['name'],
        email=data['email'],
        password_hash=generate_password_hash(data['password'])
    )
    db.session.add(user)
    db.session.commit()

    token = jwt.encode({
        'user_id': user.id,
        'exp': datetime.utcnow() + timedelta(hours=8)
    }, SECRET_KEY, algorithm='HS256')

    return jsonify({'token': token}), 201

@app.route('/api/auth/signin', methods=['POST'])
def signin():
    data = request.get_json()
    user = User.query.filter_by(email=data['email']).first()
    if not user or not check_password_hash(user.password_hash, data['password']):
        return jsonify({'message': 'Invalid credentials.'}), 401

    token = jwt.encode({
        'user_id': user.id,
        'exp': datetime.utcnow() + timedelta(hours=8)
    }, SECRET_KEY, algorithm='HS256')

    return jsonify({'token': token})

@app.route('/api/auth/me', methods=['GET'])
@token_required
def me(user):
    return jsonify({'name': user.name, 'email': user.email})

# ——— Transactions API ———
@app.route('/api/transactions', methods=['GET', 'POST'])
@token_required
def transactions(user):
    if request.method == 'POST':
        payload = request.get_json()
        tx = Transaction(
            user_id=user.id,
            type=payload['type'],
            tag=payload['tag'],
            amount=payload['amount'],
            description=payload.get('description', '')
        )
        db.session.add(tx)
        db.session.commit()
        return jsonify({'message': 'Created.'}), 201

    # GET: filters
    args       = request.args
    period     = args.get('period', 'day')
    date_range = args.get('dateRange', 'Today')
    month_name = args.get('month', '')
    year_val   = int(args.get('year', datetime.utcnow().year))
    tag_filter = args.get('tag', 'All Tags')
    main_type  = args.get('type', 'expense')

    now = datetime.utcnow()
    all_tx = Transaction.query.filter_by(user_id=user.id) \
                              .order_by(Transaction.timestamp.desc()).all()

    # summary calc
    summary = {
        'day':   sum(t.amount for t in all_tx if t.type == main_type and t.timestamp.date() == now.date()),
        'month': sum(t.amount for t in all_tx if t.type == main_type and
                     t.timestamp.year == now.year and t.timestamp.month == now.month),
        'year':  sum(t.amount for t in all_tx if t.type == main_type and
                     t.timestamp.year == now.year)
    }

    # filter helper
    def in_range(tx):
        d = tx.timestamp.date()
        today = now.date()
        if month_name:
            m_idx = datetime.strptime(month_name, '%B').month
            if tx.timestamp.month != m_idx or tx.timestamp.year != year_val:
                return False
        checks = {
            'Today':        d == today,
            'Yesterday':    d == today - timedelta(days=1),
            'Last 7 Days':  d >= today - timedelta(days=7),
            'Last 30 Days': d >= today - timedelta(days=30)
        }
        return checks.get(date_range, True)

    filtered = [t for t in all_tx if in_range(t)]
    main_items = [
        {'id': t.id, 'tag': t.tag, 'amount': t.amount}
        for t in filtered
        if t.type == main_type and (tag_filter == 'All Tags' or t.tag == tag_filter)
    ]

    gain  = sum(t.amount for t in filtered if t.type == 'income')
    loss  = sum(t.amount for t in filtered if t.type == 'expense')
    balance = gain - loss
    side_items = [{'type': t.type, 'tag': t.tag, 'amount': t.amount} for t in filtered]

    side = {
        'month': f"{month_name} {year_val}",
        'dateRange': date_range,
        'balance': balance,
        'gain': gain,
        'loss': loss,
        'items': side_items
    }

    return jsonify({'summary': summary, 'items': main_items, 'side': side})

@app.route('/api/transactions', methods=['GET'])
def get_transactions():
    transactions = Transaction.query.all()
    data = []
    for t in transactions:
        data.append({
            'id': t.id,
            'type': t.type,
            'tag': t.tag,
            'amount': t.amount,
            'date': t.date.strftime('%Y-%m-%d %H:%M:%S')
        })
    return jsonify(data)

# ——— Create DB & Run ———
if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
