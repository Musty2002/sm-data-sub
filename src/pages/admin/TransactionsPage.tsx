import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { 
  Search, 
  Loader2, 
  Download,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCcw,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Clock,
  Eye
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { getEffectiveTransactionStatus, TransactionMetadata, EffectiveStatus } from '@/lib/transactionStatus';

interface Transaction {
  id: string;
  user_id: string;
  type: string;
  category: string;
  amount: number;
  status: string;
  description: string;
  reference: string;
  created_at: string;
  metadata?: {
    mobile_number?: string;
    plan?: number;
    plan_name?: string;
    provider?: 'rgc';
    error?: string;
    api_response?: any;
    [key: string]: any;
  };
  profiles?: { full_name: string; email: string };
}

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [refundDialogOpen, setRefundDialogOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [refunding, setRefunding] = useState(false);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);

  useEffect(() => {
    fetchTransactions();
    
    // Real-time updates for admin
    const channel = supabase
      .channel('admin-transactions-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transactions',
        },
        () => {
          fetchTransactions();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [statusFilter, categoryFilter]);

  const fetchTransactions = async () => {
    try {
      let query = supabase
        .from('transactions')
        .select('*, metadata')
        .order('created_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter as any);
      }
      if (categoryFilter !== 'all') {
        query = query.eq('category', categoryFilter as any);
      }

      const { data, error } = await query.limit(500);
      if (error) throw error;

      // Fetch profiles separately
      const userIds = [...new Set(data?.map(t => t.user_id) || [])];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name, email')
        .in('user_id', userIds);

      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);
      const txnsWithProfiles = data?.map(t => ({
        ...t,
        profiles: profileMap.get(t.user_id)
      })) || [];

      setTransactions(txnsWithProfiles as any);
    } catch (error) {
      console.error('Error fetching transactions:', error);
    } finally {
      setLoading(false);
    }
  };

  const openRefundDialog = (txn: Transaction) => {
    setSelectedTransaction(txn);
    setRefundDialogOpen(true);
  };

  const processRefund = async () => {
    if (!selectedTransaction) return;

    setRefunding(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-refund-purchase', {
        body: { transactionId: selectedTransaction.id },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.message || 'Refund was not processed');

      toast.success(`Refund of ₦${Number(selectedTransaction.amount).toLocaleString()} processed successfully`);
      setRefundDialogOpen(false);
      setSelectedTransaction(null);
      fetchTransactions();
    } catch (error: any) {
      console.error('Error processing refund:', error);
      toast.error(error.message || 'Failed to process refund');
    } finally {
      setRefunding(false);
    }
  };

  const exportToCSV = () => {
    const headers = ['Date', 'User', 'Type', 'Category', 'Amount', 'Status', 'Reference'];
    const rows = transactions.map(t => [
      format(new Date(t.created_at), 'yyyy-MM-dd HH:mm'),
      t.profiles?.full_name || 'Unknown',
      t.type,
      t.category,
      t.amount,
      t.status,
      t.reference || ''
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transactions-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
  };

  const getStatusBadge = (status: string, metadata?: Transaction['metadata']) => {
    const effectiveStatus = getEffectiveTransactionStatus(status, metadata as TransactionMetadata);
    
    switch (effectiveStatus) {
      case 'completed':
        return (
          <Badge className="bg-green-100 text-green-800 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            Completed
          </Badge>
        );
      case 'pending':
        return (
          <Badge className="bg-yellow-100 text-yellow-800 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Pending
          </Badge>
        );
      case 'failed':
        return (
          <Badge className="bg-red-100 text-red-800 flex items-center gap-1">
            <XCircle className="w-3 h-3" />
            Failed
          </Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };
  
  // Helper to check if transaction actually failed based on metadata
  const isActuallyFailed = (txn: Transaction): boolean => {
    return getEffectiveTransactionStatus(txn.status, txn.metadata as TransactionMetadata) === 'failed';
  };

  const openDetailsDialog = (txn: Transaction) => {
    setSelectedTransaction(txn);
    setDetailsDialogOpen(true);
  };

  const getProviderBadge = (provider?: string) => {
    if (!provider) return null;
    const colors: Record<string, string> = {
      'rgc': 'bg-blue-100 text-blue-800',
    };
    return (
      <Badge className={colors[provider] || 'bg-gray-100 text-gray-800'} variant="outline">
        {provider.toUpperCase()}
      </Badge>
    );
  };

  const filteredTransactions = transactions.filter(t => 
    t.profiles?.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.profiles?.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.reference?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Count failed transactions using the accurate status detection
  const failedTransactions = filteredTransactions.filter(t => isActuallyFailed(t));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Transactions</h1>
          <p className="text-gray-500">View all transaction history and process refunds</p>
        </div>
        <Button onClick={exportToCSV} variant="outline">
          <Download className="w-4 h-4 mr-2" />
          Export CSV
        </Button>
      </div>

      {/* Failed Transactions Alert */}
      {statusFilter === 'all' && failedTransactions.length > 0 && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-600" />
              <div>
                <p className="font-medium text-red-800">
                  {failedTransactions.length} Failed Transaction{failedTransactions.length > 1 ? 's' : ''} Pending Refund
                </p>
                <p className="text-sm text-red-600">
                  Filter by "Failed" status to review and process refunds
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-col lg:flex-row justify-between gap-4">
            <CardTitle>All Transactions ({transactions.length})</CardTitle>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-40">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-full sm:w-40">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="airtime">Airtime</SelectItem>
                  <SelectItem value="data">Data</SelectItem>
                  <SelectItem value="electricity">Electricity</SelectItem>
                  <SelectItem value="tv">TV</SelectItem>
                  <SelectItem value="deposit">Deposit</SelectItem>
                  <SelectItem value="transfer">Transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Category</TableHead>
                   <TableHead>Network</TableHead>
                   <TableHead>Provider</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTransactions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 text-gray-500">
                      No transactions found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredTransactions.map((txn) => (
                    <TableRow key={txn.id} className={isActuallyFailed(txn) ? 'bg-red-50' : ''}>
                      <TableCell className="whitespace-nowrap">
                        {format(new Date(txn.created_at), 'MMM d, yyyy HH:mm')}
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{txn.profiles?.full_name || 'Unknown'}</p>
                          <p className="text-xs text-gray-500">{txn.profiles?.email}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {txn.type === 'credit' ? (
                            <ArrowDownRight className="w-4 h-4 text-green-500" />
                          ) : (
                            <ArrowUpRight className="w-4 h-4 text-red-500" />
                          )}
                          <span className="capitalize">{txn.type}</span>
                        </div>
                      </TableCell>
                      <TableCell className="capitalize">{txn.category}</TableCell>
                      <TableCell>
                        {txn.metadata?.network ? (
                          <Badge variant="outline" className="font-medium">
                            {txn.metadata.network}
                          </Badge>
                        ) : '-'}
                      </TableCell>
                      <TableCell>
                        {getProviderBadge(txn.metadata?.provider)}
                      </TableCell>
                      <TableCell className={`font-medium ${txn.type === 'credit' ? 'text-green-600' : 'text-red-600'}`}>
                        {txn.type === 'credit' ? '+' : '-'}₦{Number(txn.amount).toLocaleString()}
                      </TableCell>
                      <TableCell>{getStatusBadge(txn.status, txn.metadata)}</TableCell>
                      <TableCell className="font-mono text-xs text-gray-500">
                        {txn.reference || '-'}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-gray-600 hover:text-gray-800"
                            onClick={() => openDetailsDialog(txn)}
                          >
                            <Eye className="w-3 h-3" />
                          </Button>
                          {isActuallyFailed(txn) && txn.type === 'debit' && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-orange-600 border-orange-300 hover:bg-orange-50"
                              onClick={() => openRefundDialog(txn)}
                            >
                              <RefreshCcw className="w-3 h-3 mr-1" />
                              Refund
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Refund Confirmation Dialog */}
      <Dialog open={refundDialogOpen} onOpenChange={setRefundDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Refund</DialogTitle>
            <DialogDescription>
              This will credit the user's wallet with the transaction amount.
            </DialogDescription>
          </DialogHeader>
          {selectedTransaction && (
            <div className="space-y-4">
              <div className="bg-gray-50 p-4 rounded-lg space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-500">User:</span>
                  <span className="font-medium">{selectedTransaction.profiles?.full_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Category:</span>
                  <span className="capitalize">{selectedTransaction.category}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Amount:</span>
                  <span className="font-bold text-green-600">₦{Number(selectedTransaction.amount).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Reference:</span>
                  <span className="font-mono text-xs">{selectedTransaction.reference || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Description:</span>
                  <span className="text-sm">{selectedTransaction.description}</span>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefundDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={processRefund} disabled={refunding}>
              {refunding ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <RefreshCcw className="w-4 h-4 mr-2" />
                  Process Refund
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transaction Details Dialog */}
      <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Transaction Details</DialogTitle>
            <DialogDescription>
              Full details and metadata for this transaction
            </DialogDescription>
          </DialogHeader>
          {selectedTransaction && (
            <div className="space-y-4 max-h-96 overflow-y-auto">
              <div className="bg-gray-50 p-4 rounded-lg space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-500">Transaction ID:</span>
                  <span className="font-mono text-xs">{selectedTransaction.id.slice(0, 8)}...</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">User:</span>
                  <span className="font-medium">{selectedTransaction.profiles?.full_name || 'Unknown'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Category:</span>
                  <span className="capitalize">{selectedTransaction.category}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Amount:</span>
                  <span className={`font-bold ${selectedTransaction.type === 'credit' ? 'text-green-600' : 'text-red-600'}`}>
                    {selectedTransaction.type === 'credit' ? '+' : '-'}₦{Number(selectedTransaction.amount).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Status:</span>
                  {getStatusBadge(selectedTransaction.status, selectedTransaction.metadata)}
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Provider:</span>
                  {getProviderBadge(selectedTransaction.metadata?.provider) || <span className="text-gray-400">N/A</span>}
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Reference:</span>
                  <span className="font-mono text-xs">{selectedTransaction.reference || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Date:</span>
                  <span className="text-sm">{format(new Date(selectedTransaction.created_at), 'MMM d, yyyy HH:mm:ss')}</span>
                </div>
                <div>
                  <span className="text-gray-500">Description:</span>
                  <p className="text-sm mt-1">{selectedTransaction.description}</p>
                </div>
              </div>

              {/* Metadata Section */}
              {selectedTransaction.metadata && Object.keys(selectedTransaction.metadata).length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm">Transaction Metadata</h4>
                  <div className="bg-gray-50 p-4 rounded-lg space-y-2 text-sm">
                    {selectedTransaction.metadata.mobile_number && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Phone Number:</span>
                        <span className="font-mono">{selectedTransaction.metadata.mobile_number}</span>
                      </div>
                    )}
                    {selectedTransaction.metadata.plan_name && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Plan:</span>
                        <span>{selectedTransaction.metadata.plan_name}</span>
                      </div>
                    )}
                    {selectedTransaction.metadata.error && (
                      <div className="mt-2 p-2 bg-red-50 rounded border border-red-200">
                        <span className="text-red-600 font-medium text-xs">Error:</span>
                        <p className="text-red-700 text-xs mt-1">{selectedTransaction.metadata.error}</p>
                      </div>
                    )}
                    {selectedTransaction.metadata.api_response && (
                      <div className="mt-2">
                        <span className="text-gray-500 text-xs">API Response:</span>
                        <pre className="text-xs bg-gray-100 p-2 rounded mt-1 overflow-x-auto">
                          {JSON.stringify(selectedTransaction.metadata.api_response, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailsDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
