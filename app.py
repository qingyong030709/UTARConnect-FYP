# FileName: app.py
import os
from flask import Flask, request, jsonify
from flask_cors import CORS
from detector import FoulWordDetector
from nsfw_detector import NsfwDetector

import cloudinary
import cloudinary.uploader
import firebase_admin
from firebase_admin import credentials, auth, firestore
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
CORS(app)

# --- CORRECTED INITIALIZATION LOGIC ---
# In a Google Cloud environment (like Cloud Run), initializing without arguments
# allows the SDK to automatically use the environment's default service account.
# This is the recommended and most robust method for production.
try:
    print("Initializing Firebase Admin SDK using Application Default Credentials...")
    firebase_admin.initialize_app()
    print("Firebase Admin SDK initialized successfully.")
except Exception as e:
    print(f"FATAL ERROR: Could not initialize Firebase Admin SDK. Error: {e}")

# --- LAZY-LOADED SINGLETONS ---
_db_client = None
_foul_word_detector = None
_nsfw_detector = None

def get_db():
    """Initializes and returns a Firestore client, creating only one instance."""
    global _db_client
    if _db_client is None:
        print("Initializing Firestore client for the first time...")
        _db_client = firestore.client()
    return _db_client

def configure_cloudinary():
    """Configures Cloudinary using environment variables."""
    try:
        cloudinary.config(
            cloud_name=os.getenv("CLOUD_NAME"),
            api_key=os.getenv("API_KEY"),
            api_secret=os.getenv("API_SECRET"),
            secure=True
        )
        print("Cloudinary configured successfully.")
        return True
    except Exception as e:
        print(f"WARNING: Could not configure Cloudinary. Deletion will not work. Error: {e}")
        return False

# Run Cloudinary configuration once when the app starts.
configure_cloudinary()

def get_foul_word_detector():
    """Loads and returns the foul word detector, creating only one instance."""
    global _foul_word_detector
    if _foul_word_detector is None:
        print("Initializing Foul Word Detector for the first time...")
        try:
            _foul_word_detector = FoulWordDetector()
            print("Foul Word Detector is now ready.")
        except Exception as e:
            print(f"FATAL ERROR: Could not initialize Foul Word Model. Error: {e}")
    return _foul_word_detector

def get_nsfw_detector():
    """Loads and returns the NSFW detector, creating only one instance."""
    global _nsfw_detector
    if _nsfw_detector is None:
        print("Initializing NSFW Detector for the first time...")
        try:
            _nsfw_detector = NsfwDetector()
            print("NSFW Detector is now ready.")
        except Exception as e:
            print(f"WARNING: NSFW Detector could not be initialized. Error: {e}")
    return _nsfw_detector

# --- HELPER FUNCTIONS ---
def is_admin(uid):
    db = get_db()
    if db is None: return False
    try:
        user_doc_ref = db.collection('users').document(uid)
        user_doc = user_doc_ref.get()
        return user_doc.exists and user_doc.to_dict().get('role') == 'admin'
    except Exception as e:
        print(f"Error checking admin role for UID {uid}: {e}")
        return False

# --- API ENDPOINTS ---
@app.route('/predict', methods=['POST'])
def predict_toxicity():
    detector = get_foul_word_detector()
    if detector is None:
        return jsonify({'error': 'Foul word model could not be loaded'}), 500
    data = request.get_json()
    if not data or 'text' not in data:
        return jsonify({'error': 'Missing "text" field'}), 400
    return jsonify(detector.predict(data['text']))

@app.route('/predict_nsfw', methods=['POST'])
def predict_nsfw():
    detector = get_nsfw_detector()
    if detector is None:
        return jsonify({'is_nsfw': False, 'score': 0.0, 'error': 'NSFW Model could not be loaded'}), 500
    data = request.get_json()
    if not data or 'image' not in data:
        return jsonify({'error': 'Missing "image" field'}), 400
    return jsonify(detector.predict(data['image']))

@app.route('/delete-media', methods=['POST'])
def delete_media():
    id_token = request.headers.get('Authorization', '').split('Bearer ')[-1]
    if not id_token:
        return jsonify({'error': 'Authorization token is required'}), 401
    try:
        # This call requires the app to be initialized, which it now is.
        decoded_token = auth.verify_id_token(id_token)
        uid = decoded_token['uid']
    except Exception as e:
        return jsonify({'error': f'Invalid or expired authorization token: {e}'}), 401
    
    db = get_db()
    if db is None:
        return jsonify({'error': 'Backend Firestore service not available'}), 500
    
    data = request.get_json()
    post_id = data.get('postId')
    public_id = data.get('publicId')
    resource_type = data.get('resourceType', 'image')
    
    if not post_id or not public_id:
        return jsonify({'error': 'postId and publicId are required'}), 400
    
    try:
        post_ref = db.collection('posts').document(post_id)
        post_doc = post_ref.get()
        if not post_doc.exists:
            return jsonify({'error': 'Post not found'}), 404
        
        post_author_id = post_doc.to_dict().get('authorId')
        if post_author_id != uid and not is_admin(uid):
            return jsonify({'error': 'User does not have permission to delete this media'}), 403
            
        delete_result = cloudinary.uploader.destroy(public_id, resource_type=resource_type)
        if delete_result.get("result") in ["ok", "not found"]:
            return jsonify({'success': True, 'message': 'Media deleted successfully.'}), 200
        else:
            return jsonify({'error': 'Cloudinary deletion failed', 'details': delete_result}), 500
    except Exception as e:
        return jsonify({'error': f'An internal error occurred: {e}'}), 500

if __name__ == "__main__":
    app.run(debug=False, host="0.0.0.0", port=int(os.environ.get("PORT", 8080)))