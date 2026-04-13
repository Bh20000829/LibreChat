import { useState, memo } from 'react';
import { useRecoilState } from 'recoil';
import { useQuery } from '@tanstack/react-query';
import * as Select from '@ariakit/react/select';
import { FileText, LogOut, ShieldCheck, BadgeDollarSign, Users } from 'lucide-react';
import { SystemRoles } from 'librechat-data-provider';
import { LinkIcon, GearIcon, DropdownMenuSeparator, Avatar } from '@librechat/client';
import { useGetStartupConfig } from '~/data-provider';
import FilesView from '~/components/Chat/Input/Files/FilesView';
import { useAuthContext } from '~/hooks/AuthContext';
import { useLocalize } from '~/hooks';
import Settings from './Settings';
import QuotaManagement from './QuotaManagement';
import ModelPricingManagement from './ModelPricingManagement';
import UserManagement from './UserManagement';
import store from '~/store';

function AccountSettings() {
  const localize = useLocalize();
  const { user, token, isAuthenticated, logout } = useAuthContext();
  const { data: startupConfig } = useGetStartupConfig();
  const quotaBalanceQuery = useQuery<{ remainingBalanceCny: number }>(['quota-me-balance'], async () => {
    const res = await fetch('/api/quota/me', {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!res.ok) {
      throw new Error('Failed to fetch quota balance');
    }
    return res.json();
  }, {
    enabled: !!isAuthenticated,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchOnMount: true,
  });
  const [showSettings, setShowSettings] = useState(false);
  const [showQuotaManagement, setShowQuotaManagement] = useState(false);
  const [showModelPricingManagement, setShowModelPricingManagement] = useState(false);
  const [showUserManagement, setShowUserManagement] = useState(false);
  const [showFiles, setShowFiles] = useRecoilState(store.showFiles);

  return (
    <Select.SelectProvider>
      <Select.Select
        aria-label={localize('com_nav_account_settings')}
        data-testid="nav-user"
        className="mt-text-sm flex h-auto w-full items-center gap-2 rounded-xl p-2 text-sm transition-all duration-200 ease-in-out hover:bg-surface-hover"
      >
        <div className="-ml-0.9 -mt-0.8 h-8 w-8 flex-shrink-0">
          <div className="relative flex">
            <Avatar user={user} size={32} />
          </div>
        </div>
        <div
          className="mt-2 grow overflow-hidden text-ellipsis whitespace-nowrap text-left text-text-primary"
          style={{ marginTop: '0', marginLeft: '0' }}
        >
          {user?.name ?? user?.username ?? localize('com_nav_user')}
        </div>
      </Select.Select>
      <Select.SelectPopover
        className="popover-ui w-[235px]"
        style={{
          transformOrigin: 'bottom',
          marginRight: '0px',
          translate: '0px',
        }}
      >
        <div className="text-token-text-secondary ml-3 mr-2 py-2 text-sm" role="note">
          {user?.email ?? localize('com_nav_user')}
        </div>
        <DropdownMenuSeparator />
        {isAuthenticated && quotaBalanceQuery.data != null && (
          <>
            <div className="text-token-text-secondary ml-3 mr-2 py-2 text-sm" role="note">
              {localize('com_nav_daily_balance')}:{' '}
              {new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 }).format(
                Number(quotaBalanceQuery.data.remainingBalanceCny ?? 0),
              )}
            </div>
            <DropdownMenuSeparator />
          </>
        )}
        <Select.SelectItem
          value=""
          onClick={() => setShowFiles(true)}
          className="select-item text-sm"
        >
          <FileText className="icon-md" aria-hidden="true" />
          {localize('com_nav_my_files')}
        </Select.SelectItem>
        {startupConfig?.helpAndFaqURL !== '/' && (
          <Select.SelectItem
            value=""
            onClick={() => window.open(startupConfig?.helpAndFaqURL, '_blank')}
            className="select-item text-sm"
          >
            <LinkIcon aria-hidden="true" />
            {localize('com_nav_help_faq')}
          </Select.SelectItem>
        )}
        <Select.SelectItem
          value=""
          onClick={() => setShowSettings(true)}
          className="select-item text-sm"
        >
          <GearIcon className="icon-md" aria-hidden="true" />
          {localize('com_nav_settings')}
        </Select.SelectItem>
        {user?.role === SystemRoles.ADMIN && (
          <>
            <DropdownMenuSeparator />
            <div className="text-token-text-secondary ml-3 mr-2 py-2 text-sm" role="note">
              {localize('com_ui_manage')}
            </div>
            <Select.SelectItem
              value=""
              onClick={() => setShowUserManagement(true)}
              className="select-item pl-8 text-sm"
            >
              <Users className="icon-md" aria-hidden="true" />
              {localize('com_nav_user_management')}
            </Select.SelectItem>
            <Select.SelectItem
              value=""
              onClick={() => setShowQuotaManagement(true)}
              className="select-item pl-8 text-sm"
            >
              <ShieldCheck className="icon-md" aria-hidden="true" />
              {localize('com_nav_quota_management')}
            </Select.SelectItem>
            <Select.SelectItem
              value=""
              onClick={() => setShowModelPricingManagement(true)}
              className="select-item pl-8 text-sm"
            >
              <BadgeDollarSign className="icon-md" aria-hidden="true" />
              {localize('com_nav_model_pricing_management')}
            </Select.SelectItem>
          </>
        )}
        <DropdownMenuSeparator />
        <Select.SelectItem
          aria-selected={true}
          onClick={() => logout()}
          value="logout"
          className="select-item text-sm"
        >
          <LogOut className="icon-md" />
          {localize('com_nav_log_out')}
        </Select.SelectItem>
      </Select.SelectPopover>
      {showFiles && <FilesView open={showFiles} onOpenChange={setShowFiles} />}
      {showSettings && <Settings open={showSettings} onOpenChange={setShowSettings} />}
      {showQuotaManagement && (
        <QuotaManagement open={showQuotaManagement} onOpenChange={setShowQuotaManagement} />
      )}
      {showModelPricingManagement && (
        <ModelPricingManagement
          open={showModelPricingManagement}
          onOpenChange={setShowModelPricingManagement}
        />
      )}
      {showUserManagement && (
        <UserManagement open={showUserManagement} onOpenChange={setShowUserManagement} />
      )}
    </Select.SelectProvider>
  );
}

export default memo(AccountSettings);
