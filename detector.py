# FileName: detector.py
import os
import re
from transformers import pipeline, AutoTokenizer, AutoModelForSequenceClassification

class FoulWordDetector:
    """
    A class that uses a hybrid approach to detect toxic content.
    """
    BLACKLIST = {
        # --- Core English Vulgarities ---
        'fuck', 'fucked', 'fucking', 'fuk', 'faggot', 'fagot',
        'shit', 'bitch', 'asshole', 'dick', 'pussy', 'cunt',
        'nigger', 'nigga', 'coon', 'stupid', 'dumb',

        # --- Core Malay Vulgarities ---
        'babi', 'sial', 'pukimak', 'pantat', 'burit', 'kote', 'lancau', 'anjing',
        'pundek', 'pundik', 'pelacur', 'sundal', 'keparat', 'setan', 'iblis',
        'celaka', 'bangsat', 'jembalang',

        # --- Malay Insults ---
        'bodoh', 'bangang', 'bingai', 'dungu', 'otak udang', 'otak lembu',
        'kepala hotak', 'gila babi', 'gila sial', 'gila barbie', 'bahlul',
        'mangkuk', 'haprak', 'lalat busuk',

        # --- English-Malay Mix Vulgarities ---
        'fuckkau', 'fucklah', 'fucku', 'shitlah', 'cb', 'ccb', 'cibai', 'chibai',
        'kotehot', 'pantatlah', 'puki', 'pukima', 'cbkia', 'kthxbye',

        # --- Hokkien / Cantonese Vulgarities (Common in Malaysia) ---
        'lanjiao', 'kanina', 'kanasai', 'cheebye',
        'simi lanjiao', 'sohai', 'louya', 'toh', 'mou ngan tai',
        'fei lou', 'fei po',

        # --- Tamil/Malay Mix Derogatory Slangs ---
        'pariah', 'keling', 'india hitam', 'malai kutty', 'appu neh', 'lingam',

        # --- Sexual Insults / Derogatory Terms ---
        'bohsia', 'bohjan', 'pondan', 'gayboy', 'peliwat', 'homopak',
        'lesbo', 'pelesit', 'betina jalang', 'anjing betina',

        # --- Threats & Violent Phrases ---
        'bunuh', 'bunuh kau', 'tikam', 'sapu kau', 'potong kau', 'hancur kau',
        'rogol', 'rogol kau', 'tembak kau', 'mati kau', 'mampus', 'kubur kau',
        'hantam kau', 'bantai kau',

        # --- Hybrid Manglish Toxic Terms ---
        'stupidlah', 'idiotlah', 'siot', 'macai', 'anjing dap', 'barua',
        'tahi', 'pala hotak', 'celakalah',
    }
    
    ALLOWLIST = {
        # --- Manglish Particles & Fillers ---
        'lah', 'mah', 'lor', 'leh', 'liao', 'meh', 'hor', 'woi', 'wei', 'weh',
        'kan', 'gua', 'yo', 'ah', 'haiz', 'haix', 'lahhh',

        # --- Casual Expressions / Exclamations ---
        'alamak', 'adoi', 'aiyo', 'aiyah', 'walao', 'walaweh', 'walao eh',
        'padu', 'mantap', 'cun', 'cunye', 'oklah', 'okayy', 'okie', 'niceee',
        'kewl', 'best', 'terer', 'steady', 'relak', 'syok', 'shiok', 'ngam',
        'zass', 'yass', 'seh', 'sehati', 'sejuk', 'yosh', 'winliao', 'haiyaa',

        # --- Food / Lifestyle Slang ---
        'makan', 'minum', 'tapau', 'bungkus', 'lapar', 'kenyang', 'sedap',
        'lauk', 'nasi', 'teh', 'kopi', 'milo', 'roti', 'ayam', 'sambal',
        'satay', 'cendol', 'aiskrim', 'otak-otak',

        # --- Harmless Slang/Labels ---
        'bro', 'sis', 'bossku', 'abang', 'kak', 'uncle', 'aunty',
        'lengzai', 'lenglui', 'brader', 'bruh', 'buddy',
        'macha', 'otai', 'otaii', 'gang', 'fam', 'geng',

        # --- Daily Manglish Words ---
        'lepak', 'jalan', 'pusing', 'santai', 'cincai', 'kawtim',
        'pokai', 'pau', 'sapot', 'kacau', 'layan', 'tap', 'pakat',
        'steadybompiipi', 'btar',

        # --- Malaysian Context Words (Neutral) ---
        'duit', 'gaji', 'belanja', 'harga', 'saman', 'polis', 'uni',
        'college', 'kampung', 'balik', 'hari raya', 'cny', 'deepavali',
        'merdeka', 'bazar', 'pasar', 'sahur', 'buka', 'iftar', 'raya',

        # --- Gaming Slang (Safe) ---
        'noob', 'carry', 'feed', 'ez', 'rekt', 'farm',
        'main', 'alt', 'bot', 'top', 'mid', 'push', 'ranked', 'duo',

        # --- Common Short Forms & Texting Slang ---
        'af', 'jkjk', 'idgaf', 'wtv', 'hahaha', 'xoxo', 'zzz', 'haha', 'hehe',
        'ggwp', 'smh', 'wtf', 'tqtq', 'pls', 'thx', 'ty', 'np', 'nvm', 'hehehe',
        'ttyl', 'gnite', 'nite', 'gudnite', 'bye2', 'ciao', 'btw', 'kekeke',
        'afaik', 'ama', 'atm', 'bbl', 'bms', 'brb', 'cya', 'dm', 'wakaka',
        'fomo', 'ftw', 'fyi', 'gg', 'grwm', 'hbd', 'hbu', 'hf',
        'hifw', 'hmu', 'hth', 'ianad', 'ianal', 'icymi', 'idc',
        'idk', 'ig', 'iirc', 'ik', 'ikr', 'ily', 'imho', 'imo',
        'irl', 'iykyk', 'jk', 'lmao', 'lmk', 'lol', 'mfw', 'ngl',
        'oan', 'og', 'omg', 'omw', 'ootd', 'op', 'pov', 'ppl',
        'ptl', 'qotd', 'rn', 'rofl', 'rt', 'tbh', 'tbt',
        'tfw', 'tyt', 'wbu', 'wdym', 'wfh', 'wya',
        'wyd', 'yw', 'fml', 'gtg', 'g2g', 'hecm', 'istg', 'iycr',
        'msm', 'ntmy', 'pm', 'scnr', 'sflr', 'sry', 'tbf', 'tmi',
        'ttfn', 'w/e', 'w/o', 'wut', 'sdp', 'ia',

        # --- UTAR & Academic Specific ---
        'assignment', 'assgmnt', 'report', 'projek', 'presentation',
        'lab', 'tutorial', 'lecture', 'lecturer', 'exam', 'paper', 'fyp',
        'fict', 'fas', 'fbf', 'fsc', 'fam', 'fegt', 'fci',

        # --- NEW: Academic & University Life (Negative but Not Toxic) ---
        'bad', 'boring', 'challenging', 'confused', 'difficult', 'disappointing',
        'due', 'error', 'exhausted', 'fail', 'failed', 'failure', 'hard',
        'issue', 'late', 'lost', 'low', 'mark', 'mistake', 'poor', 'pressure',
        'problem', 'repeat', 'sick', 'stress', 'stressed', 'struggle',
        'struggling', 'stuck', 'terrible', 'tired', 'tough', 'useless', 'worry',

        # --- NEW: Technical & Programming Terms ---
        'bug', 'buggy', 'compile', 'crash', 'crashed', 'exception', 'fatal',
        'frozen', 'hang', 'lag', 'leak', 'warning',

        # --- NEW: Common Frustration (Non-Toxic) & Ambiguous Words ---
        'damn', 'dead', 'die', 'freaking', 'frustrating', 'heck', 'kill',
        'shot', 'shoot', 'sucks', 'annoying',

        # --- Previously Identified False Positives ---
        'testing', 'poll',
    }

    def __init__(self, model_name="distilbert-base-uncased-finetuned-sst-2-english"):
        print(f"Loading model '{model_name}' from Hugging Face Hub...")
        self.model_name = model_name
        self.model = AutoModelForSequenceClassification.from_pretrained(self.model_name)
        self.tokenizer = AutoTokenizer.from_pretrained(self.model_name)
        self.pipeline = pipeline('text-classification', model=self.model, tokenizer=self.tokenizer)
        print("Model loaded successfully.")

    # --- THIS IS THE KEY CHANGE ---
    # We are increasing the threshold to be much stricter.
    def predict(self, text: str, toxicity_threshold: float = 0.98) -> dict:
        """
        Analyzes text using a multi-step process for higher accuracy.
        """
        original_text = text
        if not isinstance(original_text, str) or not original_text.strip():
            return {'is_toxic': False, 'confidence_score': 0.0, 'text': original_text}

        words_in_text = set(re.findall(r'\b\w+\b', original_text.lower()))
        blacklisted_words_found = self.BLACKLIST.intersection(words_in_text)
        
        if blacklisted_words_found:
            print(f"BLACKLIST TRIGGERED: Found '{', '.join(blacklisted_words_found)}' in '{original_text}'.")
            return {'is_toxic': True, 'confidence_score': 1.0, 'text': original_text}

        # Use a list comprehension for a cleaner filter
        words_to_check = [word for word in words_in_text if word not in self.ALLOWLIST]
        
        filtered_text = ' '.join(words_to_check)
        
        if not filtered_text:
            print(f"Text '{original_text}' contains only allowlisted words. Deemed safe.")
            return {'is_toxic': False, 'confidence_score': 0.0, 'text': original_text}
        
        print(f"Analyzing filtered text with AI: '{filtered_text}'")
        result = self.pipeline(filtered_text)[0]
        
        # This model uses 'POSITIVE' and 'NEGATIVE' or LABEL_0 / LABEL_1. This handles both.
        is_toxic_prediction = (result['label'] == 'LABEL_1' or result['label'].lower() == 'negative')
        confidence = result['score']
        
        # The main logic check
        final_is_toxic = is_toxic_prediction and (confidence >= toxicity_threshold)
        display_confidence = confidence if is_toxic_prediction else (1 - confidence)

        return {
            'is_toxic': final_is_toxic,
            'confidence_score': round(display_confidence, 4),
            'text': original_text
        }