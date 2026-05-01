import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Deal } from '../types/deal';

interface Props {
  visible: boolean;
  deal: Deal | null;
  onClose: () => void;
}

export default function ClaimCodeModal({ visible, deal, onClose }: Props) {
  const [copied, setCopied] = useState(false);

  if (!deal) return null;

  const handleCopyCode = async () => {
    if (deal.discountCode) {
      await Clipboard.setStringAsync(deal.discountCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Claim Discount</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeIcon}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Business Info */}
          <View style={styles.businessInfo}>
            <Text style={styles.businessName}>{deal.businessName}</Text>
            <Text style={styles.offerTitle}>{deal.offerTitle}</Text>
            <View style={styles.categoryBadge}>
              <Text style={styles.categoryText}>
                {deal.category.toUpperCase()}
              </Text>
            </View>
          </View>

          {/* Discount Code */}
          <View style={styles.codeContainer}>
            <Text style={styles.codeLabel}>Your Discount Code</Text>
            <Text style={styles.discountCode}>
              {deal.discountCode || 'No code required'}
            </Text>
            {deal.discountCode && (
              <TouchableOpacity
                style={styles.copyButton}
                onPress={handleCopyCode}
              >
                <Text style={styles.copyButtonText}>
                  {copied ? '✓ Copied!' : 'Copy Code'}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Instructions */}
          <View style={styles.instructions}>
            <Text style={styles.instructionsTitle}>How to Redeem:</Text>
            <Text style={styles.instructionsText}>
              1. Show this code at {deal.businessName}
            </Text>
            <Text style={styles.instructionsText}>
              2. {deal.requirements || 'No additional requirements'}
            </Text>
            {deal.requiresStudentId && (
              <Text style={styles.instructionsText}>
                3. Valid student ID required
              </Text>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  closeButton: {
    padding: 8,
  },
  closeIcon: {
    fontSize: 20,
    color: '#888',
  },
  businessInfo: {
    marginBottom: 24,
    alignItems: 'center',
  },
  businessName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  offerTitle: {
    fontSize: 15,
    color: '#555',
    marginBottom: 12,
    textAlign: 'center',
  },
  categoryBadge: {
    alignSelf: 'center',
    backgroundColor: '#8B1A1A',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  categoryText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
  codeContainer: {
    backgroundColor: '#F5F5F5',
    borderRadius: 14,
    padding: 20,
    marginBottom: 20,
  },
  codeLabel: {
    fontSize: 13,
    color: '#888',
    marginBottom: 8,
  },
  discountCode: {
    fontSize: 32,
    fontWeight: '800',
    color: '#8B1A1A',
    textAlign: 'center',
    marginBottom: 16,
  },
  copyButton: {
    backgroundColor: '#8B1A1A',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  copyButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  instructions: {
    marginTop: 8,
  },
  instructionsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  instructionsText: {
    fontSize: 14,
    color: '#555',
    lineHeight: 20,
    marginBottom: 4,
  },
});
