import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { CheckCircle, XCircle, Clock, Share2, X, Phone, Mail, Download, FileText, Plus, Gift, ChevronLeft } from 'lucide-react';
import { getEffectiveTransactionStatus, TransactionMetadata } from '@/lib/transactionStatus';
import { format } from 'date-fns';
import html2canvas from 'html2canvas';
import { toast } from 'sonner';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { useNavigate } from 'react-router-dom';
import logo from '@/assets/sm-data-sub-logo.jpeg';

// Import network logos
import mtnLogo from '@/assets/networks/mtn-logo.png';
import airtelLogo from '@/assets/networks/airtel-logo.png';
import gloLogo from '@/assets/networks/glo-logo.png';
import nineMobileLogo from '@/assets/networks/9mobile-logo.png';

const networkLogos: Record<string, string> = {
  'MTN': mtnLogo,
  'AIRTEL': airtelLogo,
  'GLO': gloLogo,
  '9MOBILE': nineMobileLogo,
};

const networkColors: Record<string, string> = {
  'MTN': 'text-yellow-500',
  'AIRTEL': 'text-red-500',
  'GLO': 'text-green-500',
  '9MOBILE': 'text-green-600',
};

interface TransactionReceiptProps {
  open: boolean;
  onClose: () => void;
  transaction: {
    id: string;
    date: Date;
    phoneNumber: string;
    network: string;
    amount: number;
    type: 'airtime' | 'data';
    dataPlan?: string;
    status?: string;
    metadata?: any;
  };
}

export function TransactionReceipt({ open, onClose, transaction }: TransactionReceiptProps) {
  const receiptRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const [showDetails, setShowDetails] = useState(false);
  
  const generateTransactionId = () => {
    const dateStr = format(transaction.date, 'yyyyMMdd');
    const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `SMD-${dateStr}-${randomStr}`;
  };

  const transactionId = generateTransactionId();

  const handleDownload = async () => {
    if (!receiptRef.current) return;
    
    try {
      const canvas = await html2canvas(receiptRef.current, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
        allowTaint: true,
      });
      
      const link = document.createElement('a');
      link.download = `SM-Data-Sub-Receipt-${transactionId}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      
      toast.success('Receipt downloaded successfully!');
    } catch (error) {
      console.error('Error downloading receipt:', error);
      toast.error('Failed to download receipt');
    }
  };

  const handleShare = async () => {
    if (!receiptRef.current) return;
    
    try {
      // Generate image from receipt
      const canvas = await html2canvas(receiptRef.current, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
        allowTaint: true,
      });
      
      const base64Data = canvas.toDataURL('image/png').split(',')[1];
      const fileName = `SM-Data-Sub-Receipt-${transactionId}.png`;
      
      // Native Android/iOS sharing with file
      if (Capacitor.getPlatform() !== 'web') {
        try {
          // Save to cache directory first
          const result = await Filesystem.writeFile({
            path: fileName,
            data: base64Data,
            directory: Directory.Cache,
          });
          
          // Share the file using native share
          await Share.share({
            title: 'SM Data Sub - Transaction Receipt',
            text: `Transaction Receipt - ${transaction.type === 'data' ? transaction.dataPlan : 'Airtime'} for ${transaction.phoneNumber}`,
            url: result.uri,
            dialogTitle: 'Share Receipt',
          });
          
          toast.success('Receipt shared successfully!');
          return;
        } catch (nativeError) {
          console.log('Native share failed, trying web fallback:', nativeError);
        }
      }
      
      // Web fallback - convert to blob for sharing
      const blob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((b) => resolve(b!), 'image/png');
      });
      
      const file = new File([blob], fileName, { type: 'image/png' });
      
      // Check if Web Share API supports files
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: 'SM Data Sub - Transaction Receipt',
          text: `Transaction Receipt - ${transaction.type === 'data' ? transaction.dataPlan : 'Airtime'} for ${transaction.phoneNumber}`,
          files: [file],
        });
        toast.success('Receipt shared successfully!');
      } else if (navigator.share) {
        // Fallback to text share if file sharing not supported
        const receiptText = `
━━━━━━━━━━━━━━━━━━━━━━
    SM DATA SUB
   TRANSACTION RECEIPT
━━━━━━━━━━━━━━━━━━━━━━

✅ TRANSACTION ${transaction.status === 'failed' ? 'FAILED' : transaction.status === 'pending' ? 'PENDING' : 'SUCCESSFUL'}

📋 Transaction ID: ${transactionId}
📅 Date & Time: ${format(transaction.date, 'dd MMM yyyy, hh:mm a')}
📱 Phone Number: ${transaction.phoneNumber}
📶 Network: ${transaction.network}
${transaction.type === 'data' && transaction.dataPlan ? `📦 Data Plan: ${transaction.dataPlan}` : `📞 Service: Airtime`}
💰 Amount Paid: ₦${transaction.amount.toLocaleString()}.00

━━━━━━━━━━━━━━━━━━━━━━
🌐 www.smdatasub.com.ng
📞 Support: 09050799603
━━━━━━━━━━━━━━━━━━━━━━
        `.trim();
        
        await navigator.share({
          title: 'SM Data Sub - Transaction Receipt',
          text: receiptText,
        });
        toast.success('Receipt shared successfully!');
      } else {
        // Fallback: download the image instead
        const link = document.createElement('a');
        link.download = fileName;
        link.href = canvas.toDataURL('image/png');
        link.click();
        toast.success('Receipt saved as image!');
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('Error sharing receipt:', error);
        toast.error('Failed to share receipt');
      }
    }
  };

  const networkKey = (transaction.network || '').toString().toUpperCase();

  if (!open) return null;

  const effectiveStatus = transaction.status
    ? getEffectiveTransactionStatus(transaction.status, transaction.metadata as TransactionMetadata)
    : 'completed';
  const isSuccess = effectiveStatus === 'completed';
  const isFailed = effectiveStatus === 'failed';
  const statusColor = isSuccess ? 'bg-red-500' : isFailed ? 'bg-red-500' : 'bg-yellow-500';
  const statusTitle = isSuccess
    ? (transaction.type === 'data' ? 'Data Purchase Successful' : 'Airtime Purchase Successful')
    : isFailed ? 'Transaction Failed' : 'Transaction Pending';
  const StatusIconTop = isSuccess ? CheckCircle : isFailed ? XCircle : Clock;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-50 animate-in fade-in duration-200">
      {/* Full-screen Receipt Panel */}
      <div className="flex-1 overflow-hidden relative">

        {/* Top bar with Done */}
        <div className="flex items-center justify-between px-4 pb-2">
          {showDetails ? (
            <button onClick={() => setShowDetails(false)} className="flex items-center gap-1 text-gray-700 text-sm font-medium">
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
          ) : <span className="w-12" />}
          <button onClick={onClose} className="text-red-600 font-semibold text-base px-2 py-1">
            Done
          </button>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto h-full pb-6 px-4">
          {!showDetails ? (
            <>
              {/* Opay-style success summary */}
              <div className="flex flex-col items-center text-center pt-2 pb-6">
                <div className={`w-16 h-16 rounded-full ${statusColor} flex items-center justify-center shadow-lg mb-4`}>
                  <StatusIconTop className="w-9 h-9 text-white" strokeWidth={2.5} />
                </div>
                <h2 className="text-xl font-semibold text-gray-800 mb-2">{statusTitle}</h2>
                <p className="text-3xl font-bold text-gray-900">
                  ₦{transaction.amount.toLocaleString()}.00
                </p>
              </div>

              {/* Info banner */}
              <div className="bg-white rounded-2xl px-5 py-4 mb-4 shadow-sm">
                <p className="text-center text-sm text-gray-600 leading-relaxed">
                  {isSuccess
                    ? `Your ${transaction.type === 'data' ? (transaction.dataPlan || 'data bundle') : 'airtime'} has been delivered to ${transaction.phoneNumber} successfully.`
                    : isFailed
                      ? 'This transaction did not go through. If your wallet was debited, it has been refunded automatically.'
                      : 'This transaction is being processed. You will be notified once it is complete.'}
                </p>
              </div>

              {/* Action grid - Opay style */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <button
                  onClick={handleShare}
                  className="bg-white rounded-2xl p-4 flex items-center gap-3 shadow-sm active:scale-[0.98] transition-transform"
                >
                  <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                    <Share2 className="w-5 h-5 text-red-600" />
                  </div>
                  <span className="text-sm font-semibold text-gray-800">Share Receipt</span>
                </button>
                <button
                  onClick={() => { onClose(); navigate('/add-money'); }}
                  className="bg-white rounded-2xl p-4 flex items-center gap-3 shadow-sm active:scale-[0.98] transition-transform"
                >
                  <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                    <Plus className="w-5 h-5 text-red-600" />
                  </div>
                  <span className="text-sm font-semibold text-gray-800">Add Money</span>
                </button>
                <button
                  onClick={() => { onClose(); navigate('/referral'); }}
                  className="bg-white rounded-2xl p-4 flex items-center gap-3 shadow-sm active:scale-[0.98] transition-transform"
                >
                  <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                    <Gift className="w-5 h-5 text-red-600" />
                  </div>
                  <span className="text-sm font-semibold text-gray-800">Refer & Earn</span>
                </button>
                <button
                  onClick={() => setShowDetails(true)}
                  className="bg-white rounded-2xl p-4 flex items-center gap-3 shadow-sm active:scale-[0.98] transition-transform"
                >
                  <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                    <FileText className="w-5 h-5 text-red-600" />
                  </div>
                  <span className="text-sm font-semibold text-gray-800">View Details</span>
                </button>
              </div>

              {/* Hidden rich receipt used for screenshot share */}
              <div className="absolute -left-[10000px] top-0" aria-hidden="true">
                <div ref={receiptRef} className="bg-white w-[360px]">
                  <RichReceiptBody
                    transaction={transaction}
                    transactionId={transactionId}
                    networkKey={networkKey}
                  />
                </div>
              </div>
            </>
          ) : (
            <>
          {/* Receipt Card */}
          <div ref={receiptRef} className="bg-white rounded-2xl shadow-xl overflow-hidden">
            {/* Header with Logo */}
            <div className="relative pt-5 pb-4 px-5 text-center bg-gradient-to-b from-gray-50 to-white">
              {/* Watermark */}
              <div className="absolute inset-0 opacity-[0.02] pointer-events-none select-none overflow-hidden">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-5xl font-black text-gray-900 rotate-[-15deg] whitespace-nowrap">
                    SM DATA SUB
                  </div>
                </div>
              </div>
              
              {/* Logo and Brand */}
              <div className="relative flex items-center justify-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-full overflow-hidden ring-2 ring-primary/20 shadow-md">
                  <img src={logo} alt="SM Data Sub" className="w-full h-full object-cover" />
                </div>
                <div className="text-left">
                  <h2 className="text-lg font-black text-primary tracking-tight">SM DATA SUB</h2>
                  <p className="text-[9px] text-muted-foreground tracking-[0.15em] uppercase">
                    Transaction Receipt
                  </p>
                </div>
              </div>

              {/* Decorative line */}
              <div className="flex items-center gap-2">
                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent" />
              </div>
            </div>

            {/* Status Banner */}
            <div className="mx-4 mb-4">
              {(() => {
                const effectiveStatus = transaction.status 
                  ? getEffectiveTransactionStatus(transaction.status, transaction.metadata as TransactionMetadata)
                  : 'completed';
                const isSuccess = effectiveStatus === 'completed';
                const isFailed = effectiveStatus === 'failed';
                const bannerGradient = isSuccess 
                  ? 'from-red-500 to-red-600 shadow-red-500/20' 
                  : isFailed 
                    ? 'from-red-500 to-red-600 shadow-red-500/20' 
                    : 'from-yellow-500 to-amber-500 shadow-yellow-500/20';
                const StatusIcon = isSuccess ? CheckCircle : isFailed ? XCircle : Clock;
                const statusText = isSuccess ? 'TRANSACTION SUCCESSFUL' : isFailed ? 'TRANSACTION FAILED' : 'TRANSACTION PENDING';
                return (
                  <div className={`relative bg-gradient-to-r ${bannerGradient} text-white py-3 px-4 rounded-xl shadow-md overflow-hidden`}>
                    <div className="relative flex items-center justify-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center">
                        <StatusIcon className="w-4 h-4" />
                      </div>
                      <span className="font-bold text-sm tracking-wide">{statusText}</span>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Transaction Details */}
            <div className="px-4 pb-4">
              <div className="bg-gray-50 rounded-xl p-3 space-y-0">
                {/* Transaction ID */}
                <div className="flex justify-between items-center py-2.5 border-b border-dashed border-gray-200">
                  <span className="text-[11px] text-gray-500 uppercase tracking-wide">Trans. ID</span>
                  <span className="text-[11px] font-mono font-bold text-gray-800">{transactionId}</span>
                </div>
                
                {/* Date & Time */}
                <div className="flex justify-between items-center py-2.5 border-b border-dashed border-gray-200">
                  <span className="text-[11px] text-gray-500 uppercase tracking-wide">Date & Time</span>
                  <span className="text-xs font-semibold text-gray-800">
                    {format(transaction.date, 'dd MMM yyyy, hh:mm a')}
                  </span>
                </div>
                
                {/* Phone Number */}
                <div className="flex justify-between items-center py-2.5 border-b border-dashed border-gray-200">
                  <span className="text-[11px] text-gray-500 uppercase tracking-wide">Phone</span>
                  <span className="text-xs font-bold text-gray-800 font-mono">{transaction.phoneNumber}</span>
                </div>
                
                {/* Network */}
                <div className="flex justify-between items-center py-2.5 border-b border-dashed border-gray-200">
                  <span className="text-[11px] text-gray-500 uppercase tracking-wide">Network</span>
                  <div className="flex items-center gap-1.5">
                    {networkLogos[networkKey] && (
                      <div className="w-5 h-5 rounded-full bg-white shadow-sm flex items-center justify-center overflow-hidden">
                        <img 
                          src={networkLogos[networkKey]} 
                          alt={transaction.network} 
                          className="w-4 h-4 object-contain"
                        />
                      </div>
                    )}
                    <span className={`text-xs font-bold capitalize ${networkColors[networkKey] || 'text-gray-800'}`}>
                      {(transaction.network || '').toString().toLowerCase()}
                    </span>
                  </div>
                </div>

                {/* Data Plan (if applicable) */}
                {transaction.type === 'data' && transaction.dataPlan && (
                  <div className="flex justify-between items-center py-2.5 border-b border-dashed border-gray-200">
                    <span className="text-[11px] text-gray-500 uppercase tracking-wide">Data Plan</span>
                    <span className="text-xs font-semibold text-gray-800 text-right max-w-[140px]">
                      {transaction.dataPlan}
                    </span>
                  </div>
                )}

                {/* Service Type */}
                <div className="flex justify-between items-center py-2.5 border-b border-dashed border-gray-200">
                  <span className="text-[11px] text-gray-500 uppercase tracking-wide">Service</span>
                  <span className="text-xs font-semibold text-gray-800 capitalize">{transaction.type}</span>
                </div>
                
                {/* Amount - Highlighted */}
                <div className="flex justify-between items-center pt-3">
                  <span className="text-sm text-gray-600 font-medium">Amount Paid</span>
                  <span className="text-xl font-black text-primary">
                    ₦{transaction.amount.toLocaleString()}<span className="text-sm">.00</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Website Link */}
            <div className="text-center pb-3">
              <span className="text-primary text-xs font-semibold">www.smdatasub.com.ng</span>
            </div>

            {/* Support Info */}
            <div className="bg-gradient-to-r from-red-600 to-red-500 py-3 px-4">
              <p className="text-center text-white/80 text-[10px] uppercase tracking-wider mb-1.5">Customer Support</p>
              <div className="flex items-center justify-center gap-4">
                <div className="flex items-center gap-1.5 text-white">
                  <Phone className="w-3 h-3" />
                  <span className="text-xs font-bold">09050799603</span>
                </div>
                <div className="flex items-center gap-1.5 text-white">
                  <Mail className="w-3 h-3" />
                  <span className="text-xs font-bold">Email Us</span>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mt-4 flex gap-3">
            <Button 
              onClick={handleDownload}
              className="flex-1 py-5 text-sm font-bold bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              <Download className="w-4 h-4 mr-2" />
              Download
            </Button>
            <Button 
              onClick={handleShare}
              variant="outline"
              className="flex-1 py-5 text-sm font-bold bg-white hover:bg-gray-50 text-gray-800 border-2 border-gray-200"
            >
              <Share2 className="w-4 h-4 mr-2" />
              Share
            </Button>
          </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Extracted rich receipt body so it can be reused for the hidden share-image render
function RichReceiptBody({ transaction, transactionId, networkKey }: { transaction: TransactionReceiptProps['transaction']; transactionId: string; networkKey: string; }) {
  const effectiveStatus = transaction.status
    ? getEffectiveTransactionStatus(transaction.status, transaction.metadata as TransactionMetadata)
    : 'completed';
  const isSuccess = effectiveStatus === 'completed';
  const isFailed = effectiveStatus === 'failed';
  const bannerGradient = isSuccess ? 'from-red-500 to-red-600' : isFailed ? 'from-red-500 to-red-600' : 'from-yellow-500 to-amber-500';
  const StatusIcon = isSuccess ? CheckCircle : isFailed ? XCircle : Clock;
  const statusText = isSuccess ? 'TRANSACTION SUCCESSFUL' : isFailed ? 'TRANSACTION FAILED' : 'TRANSACTION PENDING';
  return (
    <div>
      <div className="pt-5 pb-4 px-5 text-center bg-gradient-to-b from-gray-50 to-white">
        <div className="flex items-center justify-center gap-3 mb-3">
          <div className="w-12 h-12 rounded-full overflow-hidden ring-2 ring-primary/20 shadow-md">
            <img src={logo} alt="SM Data Sub" className="w-full h-full object-cover" />
          </div>
          <div className="text-left">
            <h2 className="text-lg font-black text-primary tracking-tight">SM DATA SUB</h2>
            <p className="text-[9px] text-muted-foreground tracking-[0.15em] uppercase">Transaction Receipt</p>
          </div>
        </div>
      </div>
      <div className={`mx-4 mb-4 bg-gradient-to-r ${bannerGradient} text-white py-3 px-4 rounded-xl text-center font-bold text-sm flex items-center justify-center gap-2`}>
        <StatusIcon className="w-4 h-4" /> {statusText}
      </div>
      <div className="px-4 pb-4">
        <div className="bg-gray-50 rounded-xl p-3">
          <Row label="Trans. ID" value={transactionId} mono />
          <Row label="Date & Time" value={format(transaction.date, 'dd MMM yyyy, hh:mm a')} />
          <Row label="Phone" value={transaction.phoneNumber} mono />
          <Row label="Network" value={transaction.network} />
          {transaction.type === 'data' && transaction.dataPlan && (
            <Row label="Data Plan" value={transaction.dataPlan} />
          )}
          <Row label="Service" value={transaction.type} />
          <div className="flex justify-between items-center pt-3">
            <span className="text-sm text-gray-600 font-medium">Amount Paid</span>
            <span className="text-xl font-black text-primary">₦{transaction.amount.toLocaleString()}.00</span>
          </div>
        </div>
      </div>
      <div className="bg-gradient-to-r from-red-600 to-red-500 py-3 px-4 text-center text-white text-xs font-bold">
        Support: 09050799603 • www.smdatasub.com.ng
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between items-center py-2.5 border-b border-dashed border-gray-200">
      <span className="text-[11px] text-gray-500 uppercase tracking-wide">{label}</span>
      <span className={`text-xs font-semibold text-gray-800 ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}
