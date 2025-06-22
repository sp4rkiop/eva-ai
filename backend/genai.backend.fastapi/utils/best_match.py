import re, logging
from difflib import SequenceMatcher
from fuzzywuzzy import fuzz

class BestMatchService:

    @staticmethod
    async def find_match(query, search_results, media_type, threshold=0.4):
        """
        Find the best match for a query with a strict threshold to prevent false positives
        
        Parameters:
        - query: search query string
        - search_results: list of dictionaries with 'title' and 'url' keys
        - threshold: minimum similarity score required (higher = stricter)
        
        Returns:
        - best_match: the dictionary with the highest similarity score, or None if below threshold
        """
        if not query or not search_results:
            return None
    
        query = query.lower().strip()
        query_words = set(re.findall(r'\b\w+\b', query))
        
        max_similarity = 0.0
        best_match = None
        
        # Define stopwords once outside the loop
        stopwords = {'a', 'an', 'the', 'and', 'or', 'but', 'of', 'in', 'on', 'at', 'to', 'for', 'with', 'by'}
        
        for item in search_results:
            if not item.get('title'):
                continue
                
            title = item['title'].lower()
            
            # Extract words using regex to handle special characters better
            title_words = set(re.findall(r'\b\w+\b', title))
            
            # Different similarity measures
            seq_similarity = SequenceMatcher(None, query, title).ratio()
            fuzz_similarity = fuzz.ratio(query, title) / 100.0
            token_similarity = fuzz.token_sort_ratio(query, title) / 100.0
            
            # Word-based matching
            word_overlap = len(query_words.intersection(title_words))
            word_overlap_ratio = word_overlap / len(query_words) if query_words else 0
            
            # Core words matching (ignoring common words)
            core_query_words = [w for w in query_words if w not in stopwords and len(w) > 2]
            core_title_words = [w for w in title_words if w not in stopwords and len(w) > 2]
            
            if not core_query_words:
                # If query only has stopwords, fall back to full comparison
                core_match_ratio = seq_similarity
            else:
                # Check how many important query words are in the title
                core_matches = sum(1 for w in core_query_words if w in core_title_words)
                core_match_ratio = core_matches / len(core_query_words)
            
            # Calculate total similarity score with weights
            similarity = (
                seq_similarity * 0.2 +
                fuzz_similarity * 0.2 +
                token_similarity * 0.3 +
                word_overlap_ratio * 0.1 +
                core_match_ratio * 0.2
            )
            
            # Add bonuses
            if 'media_type' in item and item['media_type'] == str(media_type):
                similarity *= 1.2
            elif 'media_type' not in item and media_type == 1 and similarity > 0.0 and re.search(r'\b\d{4}\b', item['title']):
                similarity *= 1.2
            
            # Exact substring match bonus
            if query in title:
                similarity *= 1.3
            
            # Penalize very different lengths
            len_ratio = min(len(query), len(title)) / max(len(query), len(title))
            if len_ratio < 0.5:
                similarity *= 0.9
            
            # Filter out obviously wrong matches with misleading keywords
            for word in query_words:
                if word not in title and similarity > 0.3:
                    similarity *= 0.5

            if 'showbox' in title_words:
                similarity *= 1.01
            # Print for debugging
            # print(f"{item['title']} - Score: {similarity:.4f}")
            # Update best match
            if similarity > max_similarity:
                max_similarity = similarity
                best_match = item
        
        if max_similarity >= threshold and best_match:
            return best_match
        else:
            return None