"""
Audio preprocessing utilities for keyword spotting.
Converts audio files into mel spectrograms for CNN input.
"""

import numpy as np
import librosa
import torch


class AudioPreprocessor:
    """Preprocess audio files into mel spectrograms for CNN model."""
    
    def __init__(
        self,
        sample_rate=16000,
        n_mels=40,
        n_fft=480,
        hop_length=160,
        duration=1.0,  # Fixed duration in seconds
    ):
        """
        Initialize audio preprocessor.
        
        Args:
            sample_rate: Target sample rate for audio
            n_mels: Number of mel frequency bins
            n_fft: FFT window size
            hop_length: Number of samples between successive frames
            duration: Fixed duration to pad/truncate audio to
        """
        self.sample_rate = sample_rate
        self.n_mels = n_mels
        self.n_fft = n_fft
        self.hop_length = hop_length
        self.duration = duration
        self.n_samples = int(sample_rate * duration)
    
    def load_audio(self, audio_path):
        """
        Load and preprocess audio file.
        
        Args:
            audio_path: Path to audio file
            
        Returns:
            Audio waveform normalized to [-1, 1]
        """
        # Load audio and resample if needed
        audio, sr = librosa.load(audio_path, sr=self.sample_rate)
        
        # Normalize
        audio = audio / (np.max(np.abs(audio)) + 1e-8)
        
        return audio
    
    def pad_or_truncate(self, audio):
        """
        Pad or truncate audio to fixed length.
        
        Args:
            audio: Audio waveform
            
        Returns:
            Audio with exactly n_samples length
        """
        if len(audio) > self.n_samples:
            # Truncate from center
            start = (len(audio) - self.n_samples) // 2
            audio = audio[start:start + self.n_samples]
        elif len(audio) < self.n_samples:
            # Pad with zeros
            pad_width = self.n_samples - len(audio)
            audio = np.pad(audio, (pad_width // 2, pad_width - pad_width // 2))
        
        return audio
    
    def compute_mel_spectrogram(self, audio):
        """
        Compute mel spectrogram from audio.
        
        Args:
            audio: Audio waveform
            
        Returns:
            Mel spectrogram (n_mels, time_steps)
        """
        # Compute mel spectrogram
        mel_spec = librosa.feature.melspectrogram(
            y=audio,
            sr=self.sample_rate,
            n_mels=self.n_mels,
            n_fft=self.n_fft,
            hop_length=self.hop_length,
            fmin=20,
            fmax=8000
        )
        
        # Convert to log scale (dB)
        mel_spec_db = librosa.power_to_db(mel_spec, ref=np.max)
        
        # Normalize to [0, 1]
        mel_spec_db = (mel_spec_db - mel_spec_db.min()) / (mel_spec_db.max() - mel_spec_db.min() + 1e-8)
        
        return mel_spec_db
    
    def preprocess(self, audio_path):
        """
        Full preprocessing pipeline: load -> pad/truncate -> mel spectrogram.
        
        Args:
            audio_path: Path to audio file
            
        Returns:
            Mel spectrogram ready for model input (n_mels, time_steps)
        """
        # Load audio
        audio = self.load_audio(audio_path)
        
        # Pad or truncate to fixed length
        audio = self.pad_or_truncate(audio)
        
        # Compute mel spectrogram
        mel_spec = self.compute_mel_spectrogram(audio)
        
        return mel_spec
    
    def preprocess_batch(self, audio_paths):
        """
        Preprocess a batch of audio files.
        
        Args:
            audio_paths: List of audio file paths
            
        Returns:
            Tensor of shape (batch_size, 1, n_mels, time_steps)
        """
        mel_specs = []
        
        for path in audio_paths:
            mel_spec = self.preprocess(path)
            mel_specs.append(mel_spec)
        
        # Stack into batch and add channel dimension
        mel_specs = np.stack(mel_specs)
        mel_specs = np.expand_dims(mel_specs, axis=1)  # Add channel dim
        
        return torch.FloatTensor(mel_specs)


def augment_audio(audio, sample_rate=16000):
    """
    Apply data augmentation to audio.
    
    Args:
        audio: Audio waveform
        sample_rate: Sample rate
        
    Returns:
        Augmented audio
    """
    augmentations = []
    
    # Original
    augmentations.append(audio)
    
    # Time stretch
    if np.random.random() < 0.5:
        rate = np.random.uniform(0.9, 1.1)
        stretched = librosa.effects.time_stretch(audio, rate=rate)
        augmentations.append(stretched)
    
    # Pitch shift
    if np.random.random() < 0.5:
        n_steps = np.random.randint(-2, 3)
        shifted = librosa.effects.pitch_shift(audio, sr=sample_rate, n_steps=n_steps)
        augmentations.append(shifted)
    
    # Add noise
    if np.random.random() < 0.5:
        noise = np.random.randn(len(audio)) * 0.005
        noisy = audio + noise
        augmentations.append(noisy)
    
    return np.random.choice(augmentations)

