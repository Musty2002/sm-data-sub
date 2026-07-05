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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { 
  Search, 
  Loader2, 
  Eye, 
  Wallet,
  UserCog,
  MoreVertical,
  Ban,
  UserCheck,
  Smartphone,
  Monitor,
  History,
  Phone
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface User {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  phone: string;
  account_number: string;
  created_at: string;
  is_blocked?: boolean;
  blocked_reason?: string | null;
  blocked_at?: string | null;
  wallet?: { balance: number };
  roles?: { role: string }[];
}

interface LoginSession {
  id: string;
  platform: string;
  device_info: Record<string, unknown> | null;
  user_agent: string | null;
  logged_in_at: string;
  is_suspicious: boolean;
}

export default function UsersManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [fundDialogOpen, setFundDialogOpen] = useState(false);
  const [fundAmount, setFundAmount] = useState('');
  const [fundType, setFundType] = useState<'credit' | 'debit'>('credit');
  const [processing, setProcessing] = useState(false);
  
  // Block user state
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [blockReason, setBlockReason] = useState('');
  const [blockAction, setBlockAction] = useState<'block' | 'unblock'>('block');

  // Login sessions state
  const [sessionsDialogOpen, setSessionsDialogOpen] = useState(false);
  const [loginSessions, setLoginSessions] = useState<LoginSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);

  // Fix phone / provision account state
  const [phoneDialogOpen, setPhoneDialogOpen] = useState(false);
  const [newPhone, setNewPhone] = useState('');

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const [{ data: profiles }, { data: wallets }, { data: roles }] = await Promise.all([
        supabase.from('profiles').select('*, is_blocked, blocked_reason, blocked_at').order('created_at', { ascending: false }),
        supabase.from('wallets').select('user_id, balance'),
        supabase.from('user_roles').select('user_id, role')
      ]);

      const walletMap = new Map(wallets?.map(w => [w.user_id, { balance: Number(w.balance) }]) || []);
      const rolesMap = new Map<string, { role: string }[]>();
      roles?.forEach(r => {
        const existing = rolesMap.get(r.user_id) || [];
        rolesMap.set(r.user_id, [...existing, { role: r.role }]);
      });

      const formattedUsers = profiles
        ?.filter(user => user.email !== 'mustaphashehuyana@gmail.com')
        ?.map(user => ({
          ...user,
          wallet: walletMap.get(user.user_id),
          roles: rolesMap.get(user.user_id) || []
        })) || [];
      
      setUsers(formattedUsers as User[]);
    } catch (error) {
      console.error('Error fetching users:', error);
      toast.error('Failed to fetch users');
    } finally {
      setLoading(false);
    }
  };

  const fetchLoginSessions = async (userId: string) => {
    setSessionsLoading(true);
    try {
      const { data, error } = await supabase
        .from('login_sessions')
        .select('*')
        .eq('user_id', userId)
        .order('logged_in_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setLoginSessions((data || []) as unknown as LoginSession[]);
    } catch (error) {
      console.error('Error fetching login sessions:', error);
      toast.error('Failed to fetch login sessions');
    } finally {
      setSessionsLoading(false);
    }
  };

  const handleFundWallet = async () => {
    if (!selectedUser || !fundAmount) return;
    setProcessing(true);

    try {
      const amount = parseFloat(fundAmount);
      const currentBalance = selectedUser.wallet?.balance || 0;
      const newBalance = fundType === 'credit' 
        ? currentBalance + amount 
        : currentBalance - amount;

      if (newBalance < 0) {
        toast.error('Insufficient balance for debit');
        return;
      }

      // Update wallet
      const { error: walletError } = await supabase
        .from('wallets')
        .update({ balance: newBalance })
        .eq('user_id', selectedUser.user_id);

      if (walletError) throw walletError;

      // Create transaction record
      const { error: txnError } = await supabase
        .from('transactions')
        .insert({
          user_id: selectedUser.user_id,
          type: fundType,
          category: 'deposit' as const,
          amount,
          status: 'completed',
          description: `Admin ${fundType} - Manual wallet ${fundType === 'credit' ? 'funding' : 'debit'}`,
          reference: `ADMIN-${Date.now()}`
        });

      if (txnError) throw txnError;

      toast.success(`Successfully ${fundType === 'credit' ? 'credited' : 'debited'} ₦${amount.toLocaleString()}`);
      setFundDialogOpen(false);
      setFundAmount('');
      fetchUsers();
    } catch (error) {
      console.error('Error funding wallet:', error);
      toast.error('Failed to update wallet');
    } finally {
      setProcessing(false);
    }
  };

  const toggleAdminRole = async (user: User) => {
    const isAdmin = user.roles?.some(r => r.role === 'admin');
    
    try {
      if (isAdmin) {
        // Remove admin role
        const { error } = await supabase
          .from('user_roles')
          .delete()
          .eq('user_id', user.user_id)
          .eq('role', 'admin');
        
        if (error) throw error;
        toast.success('Admin role removed');
      } else {
        // Add admin role
        const { error } = await supabase
          .from('user_roles')
          .insert({ user_id: user.user_id, role: 'admin' });
        
        if (error) throw error;
        toast.success('Admin role granted');
      }
      fetchUsers();
    } catch (error) {
      console.error('Error updating role:', error);
      toast.error('Failed to update role');
    }
  };

  const handleBlockUser = async () => {
    if (!selectedUser) return;
    setProcessing(true);

    try {
      if (blockAction === 'block') {
        const { error } = await supabase
          .from('profiles')
          .update({
            is_blocked: true,
            blocked_at: new Date().toISOString(),
            blocked_reason: blockReason || 'Violation of terms of service'
          })
          .eq('user_id', selectedUser.user_id);

        if (error) throw error;
        toast.success(`${selectedUser.full_name} has been blocked`);
      } else {
        const { error } = await supabase
          .from('profiles')
          .update({
            is_blocked: false,
            blocked_at: null,
            blocked_reason: null
          })
          .eq('user_id', selectedUser.user_id);

        if (error) throw error;
        toast.success(`${selectedUser.full_name} has been unblocked`);
      }

      setBlockDialogOpen(false);
      setBlockReason('');
      fetchUsers();
    } catch (error) {
      console.error('Error updating user block status:', error);
      toast.error('Failed to update user status');
    } finally {
      setProcessing(false);
    }
  };

  const handleFixPhoneAndProvision = async () => {
    if (!selectedUser) return;
    const trimmed = newPhone.trim();
    if (!trimmed) {
      toast.error('Enter a phone number');
      return;
    }
    setProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-fix-user-account', {
        body: { userId: selectedUser.user_id, phone: trimmed },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      toast.success(`Account provisioned: ${(data as any).accountNumber}`);
      setPhoneDialogOpen(false);
      setNewPhone('');
      fetchUsers();
    } catch (e: any) {
      console.error('Fix phone error:', e);
      toast.error(e?.message || 'Failed to provision account');
    } finally {
      setProcessing(false);
    }
  };

  const filteredUsers = users.filter(user => 
    user.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.phone?.includes(searchQuery) ||
    user.account_number?.includes(searchQuery)
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Users Management</h1>
        <p className="text-gray-500">Manage all registered users</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between gap-4">
            <CardTitle>All Users ({users.length})</CardTitle>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search users..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Account No.</TableHead>
                  <TableHead>Balance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                      No users found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map((user) => (
                    <TableRow key={user.id} className={user.is_blocked ? 'bg-destructive/5' : ''}>
                      <TableCell>
                        <div className="flex items-start gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium">{user.full_name}</p>
                              {user.is_blocked && (
                                <Badge variant="destructive" className="text-xs">Blocked</Badge>
                              )}
                            </div>
                            <p className="text-sm text-gray-500">{user.email}</p>
                            <p className="text-xs text-gray-400">{user.phone}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono">{user.account_number}</TableCell>
                      <TableCell className="font-medium">
                        ₦{(user.wallet?.balance || 0).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        {user.is_blocked ? (
                          <Badge variant="destructive">Blocked</Badge>
                        ) : (
                          <Badge variant="outline" className="text-green-600 border-green-600">Active</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {user.roles?.some(r => r.role === 'admin') ? (
                          <Badge variant="destructive">Admin</Badge>
                        ) : (
                          <Badge variant="secondary">User</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-gray-500">
                        {format(new Date(user.created_at), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => {
                              setSelectedUser(user);
                              setFundType('credit');
                              setFundDialogOpen(true);
                            }}>
                              <Wallet className="w-4 h-4 mr-2" />
                              Fund Wallet
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => {
                              setSelectedUser(user);
                              setFundType('debit');
                              setFundDialogOpen(true);
                            }}>
                              <Wallet className="w-4 h-4 mr-2" />
                              Debit Wallet
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => {
                              setSelectedUser(user);
                              fetchLoginSessions(user.user_id);
                              setSessionsDialogOpen(true);
                            }}>
                              <History className="w-4 h-4 mr-2" />
                              View Login Sessions
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => {
                              setSelectedUser(user);
                              setNewPhone(user.phone || '');
                              setPhoneDialogOpen(true);
                            }}>
                              <Phone className="w-4 h-4 mr-2" />
                              Fix Phone & Provision Account
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => toggleAdminRole(user)}>
                              <UserCog className="w-4 h-4 mr-2" />
                              {user.roles?.some(r => r.role === 'admin') ? 'Remove Admin' : 'Make Admin'}
                            </DropdownMenuItem>
                            {user.is_blocked ? (
                              <DropdownMenuItem 
                                onClick={() => {
                                  setSelectedUser(user);
                                  setBlockAction('unblock');
                                  setBlockDialogOpen(true);
                                }}
                                className="text-green-600"
                              >
                                <UserCheck className="w-4 h-4 mr-2" />
                                Unblock User
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem 
                                onClick={() => {
                                  setSelectedUser(user);
                                  setBlockAction('block');
                                  setBlockReason('');
                                  setBlockDialogOpen(true);
                                }}
                                className="text-destructive"
                              >
                                <Ban className="w-4 h-4 mr-2" />
                                Block User
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Fund/Debit Dialog */}
      <Dialog open={fundDialogOpen} onOpenChange={setFundDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {fundType === 'credit' ? 'Fund' : 'Debit'} Wallet
            </DialogTitle>
            <DialogDescription>
              {fundType === 'credit' ? 'Add funds to' : 'Deduct funds from'} {selectedUser?.full_name}'s wallet
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Current Balance</Label>
              <p className="text-2xl font-bold">₦{(selectedUser?.wallet?.balance || 0).toLocaleString()}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="amount">Amount (₦)</Label>
              <Input
                id="amount"
                type="number"
                placeholder="Enter amount"
                value={fundAmount}
                onChange={(e) => setFundAmount(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFundDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleFundWallet}
              disabled={processing || !fundAmount}
              className={fundType === 'debit' ? 'bg-red-600 hover:bg-red-700' : ''}
            >
              {processing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                `${fundType === 'credit' ? 'Fund' : 'Debit'} Wallet`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Block/Unblock Dialog */}
      <Dialog open={blockDialogOpen} onOpenChange={setBlockDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className={blockAction === 'block' ? 'text-destructive' : 'text-green-600'}>
              {blockAction === 'block' ? 'Block User' : 'Unblock User'}
            </DialogTitle>
            <DialogDescription>
              {blockAction === 'block' 
                ? `This will suspend ${selectedUser?.full_name}'s account. They won't be able to access the app.`
                : `This will restore ${selectedUser?.full_name}'s account access.`
              }
            </DialogDescription>
          </DialogHeader>
          
          {blockAction === 'block' && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="blockReason">Reason for blocking</Label>
                <Input
                  id="blockReason"
                  placeholder="e.g., Fraudulent activity, Terms violation..."
                  value={blockReason}
                  onChange={(e) => setBlockReason(e.target.value)}
                />
              </div>
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
                <p className="text-sm text-destructive">
                  ⚠️ Warning: The user will see this reason when they try to access the app.
                </p>
              </div>
            </div>
          )}

          {blockAction === 'unblock' && selectedUser?.blocked_reason && (
            <div className="py-4">
              <div className="bg-secondary rounded-lg p-3">
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium">Block reason:</span> {selectedUser.blocked_reason}
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setBlockDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleBlockUser}
              disabled={processing}
              variant={blockAction === 'block' ? 'destructive' : 'default'}
              className={blockAction === 'unblock' ? 'bg-green-600 hover:bg-green-700' : ''}
            >
              {processing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                blockAction === 'block' ? 'Block User' : 'Unblock User'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Fix Phone & Provision Account Dialog */}
      <Dialog open={phoneDialogOpen} onOpenChange={setPhoneDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Phone className="w-5 h-5" />
              Fix Phone & Provision Account
            </DialogTitle>
            <DialogDescription>
              Update {selectedUser?.full_name}'s phone number and generate a new Paga virtual account in one step.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Current phone on file</Label>
              <p className="font-mono text-sm">{selectedUser?.phone || '—'}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPhone">New phone number</Label>
              <Input
                id="newPhone"
                placeholder="08012345678"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                maxLength={14}
              />
              <p className="text-xs text-muted-foreground">
                Must be a valid 11-digit Nigerian mobile starting with 070, 080, 081, or 090–091.
              </p>
            </div>
            {selectedUser?.account_number && (
              <div className="bg-secondary rounded-lg p-3 text-sm text-muted-foreground">
                ⚠️ This user already has account <span className="font-mono">{selectedUser.account_number}</span>. A new one will replace it.
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPhoneDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleFixPhoneAndProvision} disabled={processing || !newPhone.trim()}>
              {processing ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Provisioning…</>
              ) : (
                'Update & Provision'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Login Sessions Dialog */}
      <Dialog open={sessionsDialogOpen} onOpenChange={setSessionsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5" />
              Login Sessions - {selectedUser?.full_name}
            </DialogTitle>
            <DialogDescription>
              Recent login activity for this user
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            {sessionsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : loginSessions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <History className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No login sessions recorded yet</p>
                <p className="text-sm">Sessions will appear here after the user logs in</p>
              </div>
            ) : (
              <div className="space-y-3">
                {loginSessions.map((session) => (
                  <div 
                    key={session.id} 
                    className={`p-4 rounded-lg border ${session.is_suspicious ? 'border-destructive bg-destructive/5' : 'border-border bg-secondary/30'}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3">
                        {session.platform === 'android' ? (
                          <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                            <Smartphone className="w-5 h-5 text-green-600" />
                          </div>
                        ) : session.platform === 'ios' ? (
                          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                            <Smartphone className="w-5 h-5 text-gray-600" />
                          </div>
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                            <Monitor className="w-5 h-5 text-blue-600" />
                          </div>
                        )}
                        <div>
                          <div className="flex items-center gap-2">
                            <Badge variant={
                              session.platform === 'android' ? 'default' :
                              session.platform === 'ios' ? 'secondary' : 'outline'
                            }>
                              {session.platform.toUpperCase()}
                            </Badge>
                            {session.is_suspicious && (
                              <Badge variant="destructive">Suspicious</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            {format(new Date(session.logged_in_at), 'MMM d, yyyy h:mm a')}
                          </p>
                        </div>
                      </div>
                    </div>
                    {session.device_info && (
                      <div className="mt-3 text-xs text-muted-foreground bg-secondary/50 p-2 rounded">
                        {session.platform === 'web' ? (
                          <>
                            {(session.device_info as Record<string, unknown>).isMobile && (
                              <span className="text-orange-600 font-medium">Mobile Browser • </span>
                            )}
                            Screen: {(session.device_info as Record<string, unknown>).screenWidth}x{(session.device_info as Record<string, unknown>).screenHeight}
                          </>
                        ) : (
                          <>
                            {(session.device_info as Record<string, unknown>).manufacturer} {(session.device_info as Record<string, unknown>).model} • 
                            OS {(session.device_info as Record<string, unknown>).osVersion}
                            {(session.device_info as Record<string, unknown>).isVirtual && (
                              <span className="text-orange-600 ml-2 font-medium">⚠️ Virtual Device</span>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSessionsDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
