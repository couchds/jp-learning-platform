"""
Training script for keyword spotting CNN model.
"""

import os
import sys
from pathlib import Path
import argparse
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader, random_split
from tqdm import tqdm
import matplotlib
matplotlib.use('Agg')  # Use non-GUI backend for headless environments
import matplotlib.pyplot as plt

from preprocessing import AudioPreprocessor
from model import KeywordSpottingCNN, LightweightCNN, count_parameters


class KeywordDataset(Dataset):
    """Dataset for keyword spotting."""
    
    def __init__(self, manifest_path, audio_dir, preprocessor, augment=False):
        """
        Initialize dataset.
        
        Args:
            manifest_path: Path to manifest CSV file
            audio_dir: Directory containing audio files
            preprocessor: AudioPreprocessor instance
            augment: Whether to apply data augmentation
        """
        self.df = pd.read_csv(manifest_path)
        self.audio_dir = Path(audio_dir)
        self.preprocessor = preprocessor
        self.augment = augment
        
        # Create label mapping (use string keys for idx_to_label to avoid PyTorch serialization issues)
        unique_labels = sorted(self.df['label'].unique())
        self.label_to_idx = {label: idx for idx, label in enumerate(unique_labels)}
        self.idx_to_label = {str(idx): label for label, idx in self.label_to_idx.items()}
        
        print(f"Loaded {len(self.df)} recordings")
        print(f"Unique words: {len(unique_labels)}")
        print(f"Words: {', '.join(unique_labels[:10])}{'...' if len(unique_labels) > 10 else ''}")
    
    def __len__(self):
        return len(self.df)
    
    def __getitem__(self, idx):
        row = self.df.iloc[idx]
        
        # Load and preprocess audio
        audio_path = self.audio_dir / row['filename']
        mel_spec = self.preprocessor.preprocess(str(audio_path))
        
        # Add channel dimension
        mel_spec = mel_spec[np.newaxis, :, :]
        
        # Convert to tensor
        mel_spec = torch.FloatTensor(mel_spec)
        
        # Get label index
        label = self.label_to_idx[row['label']]
        
        return mel_spec, label


def train_epoch(model, dataloader, criterion, optimizer, device):
    """Train for one epoch."""
    model.train()
    total_loss = 0
    correct = 0
    total = 0
    
    pbar = tqdm(dataloader, desc='Training')
    for inputs, labels in pbar:
        inputs, labels = inputs.to(device), labels.to(device)
        
        # Forward pass
        optimizer.zero_grad()
        outputs = model(inputs)
        loss = criterion(outputs, labels)
        
        # Backward pass
        loss.backward()
        optimizer.step()
        
        # Statistics
        total_loss += loss.item()
        _, predicted = outputs.max(1)
        total += labels.size(0)
        correct += predicted.eq(labels).sum().item()
        
        # Update progress bar
        pbar.set_postfix({
            'loss': f'{loss.item():.4f}',
            'acc': f'{100.*correct/total:.2f}%'
        })
    
    return total_loss / len(dataloader), 100. * correct / total


def validate(model, dataloader, criterion, device):
    """Validate the model."""
    model.eval()
    total_loss = 0
    correct = 0
    total = 0
    
    with torch.no_grad():
        for inputs, labels in tqdm(dataloader, desc='Validation'):
            inputs, labels = inputs.to(device), labels.to(device)
            
            outputs = model(inputs)
            loss = criterion(outputs, labels)
            
            total_loss += loss.item()
            _, predicted = outputs.max(1)
            total += labels.size(0)
            correct += predicted.eq(labels).sum().item()
    
    return total_loss / len(dataloader), 100. * correct / total


def plot_training_history(history, save_path):
    """Plot training curves."""
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 4))
    
    # Loss
    ax1.plot(history['train_loss'], label='Train')
    ax1.plot(history['val_loss'], label='Validation')
    ax1.set_xlabel('Epoch')
    ax1.set_ylabel('Loss')
    ax1.set_title('Training Loss')
    ax1.legend()
    ax1.grid(True)
    
    # Accuracy
    ax2.plot(history['train_acc'], label='Train')
    ax2.plot(history['val_acc'], label='Validation')
    ax2.set_xlabel('Epoch')
    ax2.set_ylabel('Accuracy (%)')
    ax2.set_title('Training Accuracy')
    ax2.legend()
    ax2.grid(True)
    
    plt.tight_layout()
    plt.savefig(save_path)
    print(f"Training curves saved to {save_path}")


def main(args):
    # Setup
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f"Using device: {device}")
    
    # Create output directory
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Initialize preprocessor
    preprocessor = AudioPreprocessor(
        sample_rate=args.sample_rate,
        n_mels=args.n_mels,
        duration=args.duration
    )
    
    # Load dataset
    dataset = KeywordDataset(
        manifest_path=args.manifest,
        audio_dir=args.audio_dir,
        preprocessor=preprocessor,
        augment=args.augment
    )
    
    # Check minimum requirements
    num_classes = len(dataset.label_to_idx)
    if num_classes < 2:
        print("\nError: Need at least 2 different words to train a model.")
        print(f"   You currently have: {num_classes} word(s)")
        print(f"   Record more words and mark them as 'Reference' pronunciations!")
        sys.exit(1)
    
    if len(dataset) < 10:
        print(f"\nWarning: Only {len(dataset)} recordings found.")
        print(f"   Recommended: At least 5-10 recordings per word for good results.")
        print(f"   Training will continue but accuracy may be low.")
    
    # Split into train/val
    val_size = max(1, int(len(dataset) * args.val_split))  # Ensure at least 1 val sample
    train_size = len(dataset) - val_size
    
    if train_size < num_classes:
        print("\nError: Not enough training samples.")
        print(f"   Need at least {num_classes} training samples (one per class)")
        print(f"   but only have {train_size} after validation split.")
        print(f"   Record more words!")
        sys.exit(1)
    
    train_dataset, val_dataset = random_split(dataset, [train_size, val_size])
    
    print(f"\nDataset split:")
    print(f"  Train: {len(train_dataset)} samples")
    print(f"  Val: {len(val_dataset)} samples")
    
    # Create dataloaders
    train_loader = DataLoader(
        train_dataset,
        batch_size=args.batch_size,
        shuffle=True,
        num_workers=args.num_workers
    )
    
    val_loader = DataLoader(
        val_dataset,
        batch_size=args.batch_size,
        shuffle=False,
        num_workers=args.num_workers
    )
    
    # Create model
    num_classes = len(dataset.label_to_idx)
    if args.model == 'full':
        model = KeywordSpottingCNN(num_classes=num_classes, dropout=args.dropout)
    else:
        model = LightweightCNN(num_classes=num_classes, dropout=args.dropout)
    
    model = model.to(device)
    
    print(f"\nModel: {args.model}")
    print(f"Parameters: {count_parameters(model):,}")
    print(f"Classes: {num_classes}")
    
    # Loss and optimizer
    criterion = nn.CrossEntropyLoss()
    optimizer = optim.Adam(model.parameters(), lr=args.lr, weight_decay=args.weight_decay)
    scheduler = optim.lr_scheduler.ReduceLROnPlateau(
        optimizer, mode='min', factor=0.5, patience=5
    )
    
    # Training loop
    history = {
        'train_loss': [],
        'train_acc': [],
        'val_loss': [],
        'val_acc': []
    }
    
    best_val_acc = -1.0
    checkpoint = None
    
    print(f"\nTraining for {args.epochs} epochs...")
    for epoch in range(args.epochs):
        print(f"\nEpoch {epoch + 1}/{args.epochs}")
        
        # Train
        train_loss, train_acc = train_epoch(model, train_loader, criterion, optimizer, device)
        
        # Validate
        val_loss, val_acc = validate(model, val_loader, criterion, device)
        
        # Update learning rate
        scheduler.step(val_loss)
        
        # Save history
        history['train_loss'].append(train_loss)
        history['train_acc'].append(train_acc)
        history['val_loss'].append(val_loss)
        history['val_acc'].append(val_acc)
        
        print(f"Train Loss: {train_loss:.4f}, Train Acc: {train_acc:.2f}%")
        print(f"Val Loss: {val_loss:.4f}, Val Acc: {val_acc:.2f}%")
        
        # Save best model
        if val_acc > best_val_acc:
            best_val_acc = val_acc
            checkpoint = {
                'epoch': epoch,
                'model_state_dict': model.state_dict(),
                'optimizer_state_dict': optimizer.state_dict(),
                'val_acc': val_acc,
                'label_to_idx': dataset.label_to_idx,
                'idx_to_label': dataset.idx_to_label,
                'preprocessor_config': {
                    'sample_rate': args.sample_rate,
                    'n_mels': args.n_mels,
                    'duration': args.duration
                }
            }
            torch.save(checkpoint, output_dir / 'best_model.pt')
            print(f"Saved best model (val_acc: {val_acc:.2f}%)")
    
    # Save final model
    if checkpoint is not None:
        torch.save(checkpoint, output_dir / 'final_model.pt')
    
    # Plot training curves
    plot_training_history(history, output_dir / 'training_curves.png')
    
    print("\nTraining complete!")
    print(f"Best validation accuracy: {best_val_acc:.2f}%")
    print(f"Models saved to: {output_dir}")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Train keyword spotting model')
    
    # Data
    parser.add_argument('--manifest', type=str, default='data/training/manifest.csv',
                        help='Path to manifest CSV file')
    parser.add_argument('--audio-dir', type=str, default='data/training/audio',
                        help='Directory containing audio files')
    parser.add_argument('--output-dir', type=str, default='models/keyword_spotting',
                        help='Output directory for trained models')
    
    # Model
    parser.add_argument('--model', type=str, default='full', choices=['full', 'lightweight'],
                        help='Model architecture')
    parser.add_argument('--dropout', type=float, default=0.5,
                        help='Dropout rate')
    
    # Training
    parser.add_argument('--epochs', type=int, default=50,
                        help='Number of training epochs')
    parser.add_argument('--batch-size', type=int, default=32,
                        help='Batch size')
    parser.add_argument('--lr', type=float, default=0.001,
                        help='Learning rate')
    parser.add_argument('--weight-decay', type=float, default=0.0001,
                        help='Weight decay (L2 regularization)')
    parser.add_argument('--val-split', type=float, default=0.2,
                        help='Validation split ratio')
    
    # Preprocessing
    parser.add_argument('--sample-rate', type=int, default=16000,
                        help='Audio sample rate')
    parser.add_argument('--n-mels', type=int, default=40,
                        help='Number of mel frequency bins')
    parser.add_argument('--duration', type=float, default=1.0,
                        help='Fixed audio duration in seconds')
    parser.add_argument('--augment', action='store_true',
                        help='Apply data augmentation')
    
    # System
    parser.add_argument('--num-workers', type=int, default=4,
                        help='Number of data loading workers')
    
    args = parser.parse_args()
    
    main(args)
