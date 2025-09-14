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

try:
    cred = credentials.Certificate("service-account-key.json")
    firebase_admin.initialize_app(cred)
    db = firestore.client()
    print("Firebase Admin SDK initialized successfully.")
except Exception as e:
    print(f"FATAL ERROR: Could not initialize Firebase Admin SDK. Error: {e}")
    db = None

try:
    cloudinary.config(
        cloud_name=os.getenv("CLOUD_NAME"),
        api_key=os.getenv("API_KEY"),
        api_secret=os.getenv("API_SECRET"),
        secure=True
    )
    print("Cloudinary configured successfully.")
except Exception as e:
    print(f"WARNING: Could not configure Cloudinary. Deletion will not work. Error: {e}")


# --- LAZY LOADING IMPLEMENTATION ---
# 1. Initialize the detectors as None. They will not be loaded on startup.
foul_word_detector = None
nsfw_detector = None
MODEL_PATH = './toxic-content-model'

# 2. Use the 'global' keyword to modify these variables from within our functions.
def get_foul_word_detector():
    """Loads the foul word detector if it hasn't been loaded yet."""
    global foul_word_detector
    if foul_word_detector is None:
        print("Initializing Foul Word Detector for the first time...")
        try:
            foul_word_detector = FoulWordDetector(model_path=MODEL_PATH)
            print("Foul Word Detector is now ready.")
        except Exception as e:
            print(f"FATAL ERROR: Could not initialize Foul Word Model. Error: {e}")
    return foul_word_detector

def get_nsfw_detector():
    """Loads the NSFW detector if it hasn't been loaded yet."""
    global nsfw_detector
    if nsfw_detector is None:
        print("Initializing NSFW Detector for the first time...")
        try:
            nsfw_detector = NsfwDetector()
            print("NSFW Detector is now ready.")
        except Exception as e:
            print(f"WARNING: NSFW Detector could not be initialized. Error: {e}")
    return nsfw_detector
# --- END OF LAZY LOADING IMPLEMENTATION ---


def is_admin(uid):
    try:
        user_doc_ref = db.collection('users').document(uid)
        user_doc = user_doc_ref.get()
        if user_doc.exists:
            return user_doc.to_dict().get('role') == 'admin'
        return False
    except Exception as e:
        print(f"Error checking admin role for UID {uid}: {e}")
        return False

@app.route('/predict', methods=['POST'])
def predict_toxicity():
    # 3. Call our new helper function to get the detector.
    detector = get_foul_word_detector()
    if detector is None: return jsonify({'error': 'Foul word model could not be loaded'}), 500
    
    data = request.get_json()
    if not data or 'text' not in data: return jsonify({'error': 'Missing "text" field'}), 400
    return jsonify(detector.predict(data['text']))

@app.route('/predict_nsfw', methods=['POST'])
def predict_nsfw():
    # 4. Call our new helper function to get the detector.
    detector = get_nsfw_detector()
    if detector is None: return jsonify({'is_nsfw': False, 'score': 0.0, 'error': 'NSFW Model could not be loaded'})
    
    data = request.get_json()
    if not data or 'image' not in data: return jsonify({'error': 'Missing "image" field'}), 400
    return jsonify(detector.predict(data['image']))

@app.route('/delete-media', methods=['POST'])
def delete_media():
    if db is None:
        return jsonify({'error': 'Backend Firestore service not available'}), 500
    id_token = request.headers.get('Authorization', '').split('Bearer ')[-1]
    if not id_token:
        return jsonify({'error': 'Authorization token is required'}), 401
    try:
        decoded_token = auth.verify_id_token(id_token)
        uid = decoded_token['uid']
    except Exception as e:
        return jsonify({'error': 'Invalid or expired authorization token'}), 401
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
            print(f"Authorization failed: User {uid} is not author ({post_author_id}) and not an admin.")
            return jsonify({'error': 'User does not have permission to delete this media'}), 403
        print(f"User {uid} authorized. Deleting Cloudinary asset: {public_id} of type: {resource_type}")
        delete_result = cloudinary.uploader.destroy(public_id, resource_type=resource_type)
        print("Cloudinary deletion result:", delete_result)
        if delete_result.get("result") in ["ok", "not found"]:
            return jsonify({'success': True, 'message': 'Media deleted successfully.'}), 200
        else:
            return jsonify({'error': 'Cloudinary deletion failed', 'details': delete_result}), 500
    except Exception as e:
        print(f"An error occurred during media deletion: {e}")
        return jsonify({'error': f'An internal error occurred: {e}'}), 500