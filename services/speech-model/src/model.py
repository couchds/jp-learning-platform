"""
CNN model for keyword spotting (single-word speech recognition).
Based on proven architectures for command recognition (Google Speech Commands).
"""

import torch
import torch.nn as nn
import torch.nn.functional as F


class KeywordSpottingCNN(nn.Module):
    """
    CNN model for keyword spotting.
    
    Architecture:
        - 4 convolutional blocks with batch norm and pooling
        - Dropout for regularization
        - Fully connected layers for classification
        - Designed for mel spectrogram input
    """
    
    def __init__(self, num_classes, input_channels=1, dropout=0.5):
        """
        Initialize model.
        
        Args:
            num_classes: Number of words to recognize
            input_channels: Number of input channels (1 for mono audio)
            dropout: Dropout rate for regularization
        """
        super(KeywordSpottingCNN, self).__init__()
        
        self.num_classes = num_classes
        
        # Conv Block 1: Extract low-level features
        self.conv1 = nn.Conv2d(input_channels, 64, kernel_size=3, padding=1)
        self.bn1 = nn.BatchNorm2d(64)
        self.pool1 = nn.MaxPool2d(kernel_size=2, stride=2)
        
        # Conv Block 2: Extract mid-level features
        self.conv2 = nn.Conv2d(64, 128, kernel_size=3, padding=1)
        self.bn2 = nn.BatchNorm2d(128)
        self.pool2 = nn.MaxPool2d(kernel_size=2, stride=2)
        
        # Conv Block 3: Extract higher-level features
        self.conv3 = nn.Conv2d(128, 256, kernel_size=3, padding=1)
        self.bn3 = nn.BatchNorm2d(256)
        self.pool3 = nn.MaxPool2d(kernel_size=2, stride=2)
        
        # Conv Block 4: Extract abstract features
        self.conv4 = nn.Conv2d(256, 512, kernel_size=3, padding=1)
        self.bn4 = nn.BatchNorm2d(512)
        self.pool4 = nn.MaxPool2d(kernel_size=2, stride=2)
        
        # Dropout
        self.dropout = nn.Dropout(dropout)
        
        # Fully connected layers
        # Note: Output size depends on input mel spectrogram size
        # For 40 mel bins and ~100 time steps, after 4 pooling layers:
        # 40 / 16 = 2.5 (rounds to 2), 100 / 16 = 6.25 (rounds to 6)
        # So feature map is approximately 512 * 2 * 6 = 6144
        self.fc1 = nn.Linear(512 * 2 * 6, 512)
        self.fc2 = nn.Linear(512, 256)
        self.fc3 = nn.Linear(256, num_classes)
        
    def forward(self, x):
        """
        Forward pass.
        
        Args:
            x: Input tensor of shape (batch, 1, n_mels, time_steps)
            
        Returns:
            Logits of shape (batch, num_classes)
        """
        # Conv Block 1
        x = self.conv1(x)
        x = self.bn1(x)
        x = F.relu(x)
        x = self.pool1(x)
        
        # Conv Block 2
        x = self.conv2(x)
        x = self.bn2(x)
        x = F.relu(x)
        x = self.pool2(x)
        
        # Conv Block 3
        x = self.conv3(x)
        x = self.bn3(x)
        x = F.relu(x)
        x = self.pool3(x)
        
        # Conv Block 4
        x = self.conv4(x)
        x = self.bn4(x)
        x = F.relu(x)
        x = self.pool4(x)
        
        # Flatten
        x = x.view(x.size(0), -1)
        
        # Fully connected layers with dropout
        x = F.relu(self.fc1(x))
        x = self.dropout(x)
        
        x = F.relu(self.fc2(x))
        x = self.dropout(x)
        
        x = self.fc3(x)
        
        return x
    
    def predict(self, x):
        """
        Predict class probabilities.
        
        Args:
            x: Input tensor
            
        Returns:
            Class probabilities (batch, num_classes)
        """
        logits = self.forward(x)
        probs = F.softmax(logits, dim=1)
        return probs


class LightweightCNN(nn.Module):
    """
    Lightweight CNN for faster inference.
    Good for devices with limited compute.
    """
    
    def __init__(self, num_classes, input_channels=1, dropout=0.3):
        super(LightweightCNN, self).__init__()
        
        self.num_classes = num_classes
        
        # Fewer and smaller conv layers
        self.conv1 = nn.Conv2d(input_channels, 32, kernel_size=3, padding=1)
        self.bn1 = nn.BatchNorm2d(32)
        self.pool1 = nn.MaxPool2d(2, 2)
        
        self.conv2 = nn.Conv2d(32, 64, kernel_size=3, padding=1)
        self.bn2 = nn.BatchNorm2d(64)
        self.pool2 = nn.MaxPool2d(2, 2)
        
        self.conv3 = nn.Conv2d(64, 128, kernel_size=3, padding=1)
        self.bn3 = nn.BatchNorm2d(128)
        self.pool3 = nn.MaxPool2d(2, 2)
        
        self.dropout = nn.Dropout(dropout)
        
        # Smaller FC layers
        self.fc1 = nn.Linear(128 * 5 * 12, 256)
        self.fc2 = nn.Linear(256, num_classes)
    
    def forward(self, x):
        x = F.relu(self.bn1(self.conv1(x)))
        x = self.pool1(x)
        
        x = F.relu(self.bn2(self.conv2(x)))
        x = self.pool2(x)
        
        x = F.relu(self.bn3(self.conv3(x)))
        x = self.pool3(x)
        
        x = x.view(x.size(0), -1)
        
        x = F.relu(self.fc1(x))
        x = self.dropout(x)
        x = self.fc2(x)
        
        return x
    
    def predict(self, x):
        logits = self.forward(x)
        probs = F.softmax(logits, dim=1)
        return probs


def count_parameters(model):
    """Count the number of trainable parameters in a model."""
    return sum(p.numel() for p in model.parameters() if p.requires_grad)


if __name__ == '__main__':
    # Test model creation
    num_words = 50  # Example: 50 different words
    model = KeywordSpottingCNN(num_classes=num_words)
    
    print(f"Model: KeywordSpottingCNN")
    print(f"Parameters: {count_parameters(model):,}")
    
    # Test forward pass
    batch_size = 4
    n_mels = 40
    time_steps = 100
    dummy_input = torch.randn(batch_size, 1, n_mels, time_steps)
    
    output = model(dummy_input)
    print(f"Input shape: {dummy_input.shape}")
    print(f"Output shape: {output.shape}")
    
    # Test lightweight model
    light_model = LightweightCNN(num_classes=num_words)
    print(f"\nLightweight Model Parameters: {count_parameters(light_model):,}")

