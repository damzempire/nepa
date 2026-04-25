import React from 'react';
import { 
  Search, 
  Inbox, 
  FileText, 
  Users, 
  ShoppingCart, 
  AlertCircle,
  Plus,
  RefreshCw,
  Settings,
  Filter
} from 'lucide-react';

export interface EmptyStateAction {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
  icon?: React.ReactNode;
}

export interface EmptyStateProps {
  type?: 'no-data' | 'no-results' | 'error' | 'loading' | 'custom';
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  actions?: EmptyStateAction[];
  className?: string;
  size?: 'small' | 'medium' | 'large';
  'aria-label'?: string;
  'aria-describedby'?: string;
}

const EmptyState: React.FC<EmptyStateProps> = ({
  type = 'no-data',
  title,
  description,
  icon,
  actions = [],
  className = '',
  size = 'medium',
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy
}) => {
  const getDefaultIcon = () => {
    switch (type) {
      case 'no-results':
        return <Search size={48} className="text-gray-400" />;
      case 'error':
        return <AlertCircle size={48} className="text-red-400" />;
      case 'loading':
        return <RefreshCw size={48} className="text-blue-400 animate-spin" />;
      case 'no-data':
      default:
        return <Inbox size={48} className="text-gray-400" />;
    }
  };

  const getDefaultTitle = () => {
    switch (type) {
      case 'no-results':
        return 'No results found';
      case 'error':
        return 'Something went wrong';
      case 'loading':
        return 'Loading...';
      case 'no-data':
      default:
        return 'No data available';
    }
  };

  const getDefaultDescription = () => {
    switch (type) {
      case 'no-results':
        return 'Try adjusting your search or filter criteria';
      case 'error':
        return 'Please try again or contact support if the issue persists';
      case 'loading':
        return 'Please wait while we fetch your data';
      case 'no-data':
      default:
        return 'There are no items to display at this time';
    }
  };

  const getSizeClasses = () => {
    switch (size) {
      case 'small':
        return 'py-8 px-4';
      case 'large':
        return 'py-16 px-8';
      case 'medium':
      default:
        return 'py-12 px-6';
    }
  };

  const getIconSize = () => {
    switch (size) {
      case 'small':
        return 32;
      case 'large':
        return 64;
      case 'medium':
      default:
        return 48;
    }
  };

  const displayIcon = icon || getDefaultIcon();
  const displayTitle = title || getDefaultTitle();
  const displayDescription = description || getDefaultDescription();

  return (
    <div 
      className={`flex flex-col items-center justify-center text-center ${getSizeClasses()} ${className}`}
      role="status"
      aria-label={ariaLabel || displayTitle}
      aria-describedby={ariaDescribedBy}
    >
      <div className="mb-4">
        {React.cloneElement(displayIcon as React.ReactElement, { 
          size: getIconSize(),
          className: `${displayIcon.props?.className || ''} mx-auto`
        })}
      </div>
      
      <h3 className="text-lg font-medium text-gray-900 mb-2">
        {displayTitle}
      </h3>
      
      <p className="text-gray-500 mb-6 max-w-md">
        {displayDescription}
      </p>
      
      {actions.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-center">
          {actions.map((action, index) => (
            <button
              key={index}
              onClick={action.onClick}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                action.variant === 'primary'
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
              aria-label={action.label}
            >
              {action.icon}
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default EmptyState;

// Specialized empty state components for common use cases
export const NoDataEmptyState: React.FC<Omit<EmptyStateProps, 'type'>> = (props) => (
  <EmptyState type="no-data" {...props} />
);

export const NoResultsEmptyState: React.FC<Omit<EmptyStateProps, 'type'>> = (props) => (
  <EmptyState type="no-results" {...props} />
);

export const ErrorEmptyState: React.FC<Omit<EmptyStateProps, 'type'>> = (props) => (
  <EmptyState type="error" {...props} />
);

export const LoadingEmptyState: React.FC<Omit<EmptyStateProps, 'type'>> = (props) => (
  <EmptyState type="loading" {...props} />
);

// Context-specific empty states
export const TableEmptyState: React.FC<{
  onAdd?: () => void;
  onRefresh?: () => void;
  addLabel?: string;
  className?: string;
}> = ({ 
  onAdd, 
  onRefresh, 
  addLabel = 'Add Item',
  className = '' 
}) => (
  <EmptyState
    type="no-data"
    title="No data in table"
    description="Start by adding your first item or refresh to see if data is available"
    actions={[
      ...(onAdd ? [{
        label: addLabel,
        onClick: onAdd,
        variant: 'primary' as const,
        icon: <Plus size={16} />
      }] : []),
      ...(onRefresh ? [{
        label: 'Refresh',
        onClick: onRefresh,
        variant: 'secondary' as const,
        icon: <RefreshCw size={16} />
      }] : [])
    ]}
    className={className}
  />
);

export const SearchEmptyState: React.FC<{
  onClearSearch?: () => void;
  onRefineSearch?: () => void;
  searchTerm?: string;
  className?: string;
}> = ({ 
  onClearSearch, 
  onRefineSearch,
  searchTerm,
  className = '' 
}) => (
  <EmptyState
    type="no-results"
    title="No results found"
    description={searchTerm 
      ? `No results found for "${searchTerm}". Try different keywords or clear your search.`
      : 'No results found. Try adjusting your search criteria.'
    }
    actions={[
      ...(onClearSearch ? [{
        label: 'Clear Search',
        onClick: onClearSearch,
        variant: 'secondary' as const,
        icon: <Filter size={16} />
      }] : []),
      ...(onRefineSearch ? [{
        label: 'Refine Search',
        onClick: onRefineSearch,
        variant: 'primary' as const,
        icon: <Search size={16} />
      }] : [])
    ]}
    className={className}
  />
);

export const ListEmptyState: React.FC<{
  onCreate?: () => void;
  onImport?: () => void;
  createLabel?: string;
  importLabel?: string;
  className?: string;
}> = ({ 
  onCreate, 
  onImport,
  createLabel = 'Create New',
  importLabel = 'Import Data',
  className = '' 
}) => (
  <EmptyState
    type="no-data"
    title="No items in list"
    description="Your list is empty. Create your first item or import existing data to get started."
    actions={[
      ...(onCreate ? [{
        label: createLabel,
        onClick: onCreate,
        variant: 'primary' as const,
        icon: <Plus size={16} />
      }] : []),
      ...(onImport ? [{
        label: importLabel,
        onClick: onImport,
        variant: 'secondary' as const,
        icon: <FileText size={16} />
      }] : [])
    ]}
    className={className}
  />
);
