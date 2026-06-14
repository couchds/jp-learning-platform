"""
Inference module for keyword spotting model.
"""

import torch
import numpy as np
from pathlib import Path

from preprocessing import AudioPreprocessor
from model import KeywordSpottingCNN, LightweightCNN


class KeywordPredictor:
    """Predict keywords from audio using trained model."""
    
    def __init__(self, model_path, device=None):
        """
        Initialize predictor.
        
        Args:
            model_path: Path to trained model checkpoint
            device: Device to run on ('cuda' or 'cpu', auto-detect if None)
        """
        if device is None:
            self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        else:
            self.device = torch.device(device)
        
        # Load checkpoint
        print(f"Loading model from {model_path}...")
        checkpoint = torch.load(model_path, map_location=self.device)
        
        # Get metadata
        self.label_to_idx = checkpoint['label_to_idx']
        self.idx_to_label = checkpoint['idx_to_label']
        preprocessor_config = checkpoint['preprocessor_config']
        
        # Initialize preprocessor
        self.preprocessor = AudioPreprocessor(
            sample_rate=preprocessor_config['sample_rate'],
            n_mels=preprocessor_config['n_mels'],
            duration=preprocessor_config['duration']
        )
        
        # Initialize model
        num_classes = len(self.label_to_idx)
        
        # Try to infer model type from state dict
        state_dict = checkpoint['model_state_dict']
        if 'conv4.weight' in state_dict:
            self.model = KeywordSpottingCNN(num_classes=num_classes)
        else:
            self.model = LightweightCNN(num_classes=num_classes)
        
        self.model.load_state_dict(state_dict)
        self.model = self.model.to(self.device)
        self.model.eval()
        
        print(f"Model loaded successfully")
        print(f"Classes: {len(self.idx_to_label)}")
        print(f"Device: {self.device}")
    
    def predict(self, audio_path, top_k=5):
        """
        Predict keyword from audio file.
        
        Args:
            audio_path: Path to audio file
            top_k: Return top-k predictions
            
        Returns:
            List of tuples (word, confidence)
        """
        # Preprocess audio
        mel_spec = self.preprocessor.preprocess(str(audio_path))
        mel_spec = mel_spec[np.newaxis, np.newaxis, :, :]  # Add batch and channel dims
        mel_spec = torch.FloatTensor(mel_spec).to(self.device)
        
        # Predict
        with torch.no_grad():
            probs = self.model.predict(mel_spec)
        
        # Get top-k predictions
        probs = probs.cpu().numpy()[0]
        top_indices = np.argsort(probs)[::-1][:top_k]
        
        results = []
        for idx in top_indices:
            word = self.idx_to_label[str(idx)]
            confidence = float(probs[idx])
            results.append((word, confidence))
        
        return results
    
    def predict_word(self, audio_path):
        """
        Predict single best word from audio.
        
        Args:
            audio_path: Path to audio file
            
        Returns:
            Tuple of (word, confidence)
        """
        results = self.predict(audio_path, top_k=1)
        return results[0]
    
    def predict_batch(self, audio_paths, top_k=5):
        """
        Predict keywords for a batch of audio files.
        
        Args:
            audio_paths: List of audio file paths
            top_k: Return top-k predictions for each
            
        Returns:
            List of prediction lists
        """
        results = []
        for audio_path in audio_paths:
            preds = self.predict(audio_path, top_k=top_k)
            results.append(preds)
        return results


def main():
    """Command-line interface for predictions."""
    import argparse
    
    parser = argparse.ArgumentParser(description='Predict keywords from audio')
    parser.add_argument('audio_file', type=str, help='Path to audio file')
    parser.add_argument('--model', type=str, default='models/keyword_spotting/best_model.pt',
                        help='Path to trained model')
    parser.add_argument('--top-k', type=int, default=5,
                        help='Show top-k predictions')
    
    args = parser.parse_args()
    
    # Initialize predictor
    predictor = KeywordPredictor(args.model)
    
    # Predict
    print(f"\nPredicting for: {args.audio_file}")
    results = predictor.predict(args.audio_file, top_k=args.top_k)
    
    print(f"\nTop {args.top_k} predictions:")
    for i, (word, confidence) in enumerate(results, 1):
        print(f"{i}. {word:20s} {confidence*100:5.2f}%")


if __name__ == '__main__':
    main()

