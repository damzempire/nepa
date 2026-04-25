import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import EmptyState, {
  NoDataEmptyState,
  NoResultsEmptyState,
  ErrorEmptyState,
  LoadingEmptyState,
  TableEmptyState,
  SearchEmptyState,
  ListEmptyState
} from './EmptyState';

// Extend Jest matchers
expect.extend(toHaveNoViolations);

describe('EmptyState Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic EmptyState', () => {
    it('renders default empty state', () => {
      render(<EmptyState />);
      
      expect(screen.getByRole('status')).toBeInTheDocument();
      expect(screen.getByText('No data available')).toBeInTheDocument();
      expect(screen.getByText('There are no items to display at this time')).toBeInTheDocument();
    });

    it('renders custom title and description', () => {
      render(
        <EmptyState 
          title="Custom Title" 
          description="Custom description text"
        />
      );
      
      expect(screen.getByText('Custom Title')).toBeInTheDocument();
      expect(screen.getByText('Custom description text')).toBeInTheDocument();
    });

    it('renders different types correctly', () => {
      const { rerender } = render(<EmptyState type="no-results" />);
      expect(screen.getByText('No results found')).toBeInTheDocument();
      expect(screen.getByText('Try adjusting your search or filter criteria')).toBeInTheDocument();

      rerender(<EmptyState type="error" />);
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
      expect(screen.getByText('Please try again or contact support if the issue persists')).toBeInTheDocument();

      rerender(<EmptyState type="loading" />);
      expect(screen.getByText('Loading...')).toBeInTheDocument();
      expect(screen.getByText('Please wait while we fetch your data')).toBeInTheDocument();
    });

    it('renders custom icon when provided', () => {
      const CustomIcon = () => <div data-testid="custom-icon">🎯</div>;
      render(<EmptyState icon={<CustomIcon />} />);
      
      expect(screen.getByTestId('custom-icon')).toBeInTheDocument();
    });

    it('renders actions correctly', () => {
      const mockAction1 = jest.fn();
      const mockAction2 = jest.fn();
      
      render(
        <EmptyState
          actions={[
            { label: 'Action 1', onClick: mockAction1, variant: 'primary' },
            { label: 'Action 2', onClick: mockAction2, variant: 'secondary' }
          ]}
        />
      );
      
      const action1Button = screen.getByRole('button', { name: 'Action 1' });
      const action2Button = screen.getByRole('button', { name: 'Action 2' });
      
      expect(action1Button).toBeInTheDocument();
      expect(action2Button).toBeInTheDocument();
      
      fireEvent.click(action1Button);
      fireEvent.click(action2Button);
      
      expect(mockAction1).toHaveBeenCalledTimes(1);
      expect(mockAction2).toHaveBeenCalledTimes(1);
    });

    it('applies size variants correctly', () => {
      const { rerender } = render(<EmptyState size="small" />);
      expect(screen.getByRole('status')).toHaveClass('py-8', 'px-4');

      rerender(<EmptyState size="large" />);
      expect(screen.getByRole('status')).toHaveClass('py-16', 'px-8');

      rerender(<EmptyState size="medium" />);
      expect(screen.getByRole('status')).toHaveClass('py-12', 'px-6');
    });

    it('applies custom className', () => {
      render(<EmptyState className="custom-class" />);
      expect(screen.getByRole('status')).toHaveClass('custom-class');
    });

    it('has proper accessibility attributes', () => {
      render(
        <EmptyState 
          aria-label="Custom aria label"
          aria-describedby="custom-description"
        />
      );
      
      const element = screen.getByRole('status');
      expect(element).toHaveAttribute('aria-label', 'Custom aria label');
      expect(element).toHaveAttribute('aria-describedby', 'custom-description');
    });
  });

  describe('Specialized Empty States', () => {
    it('renders NoDataEmptyState correctly', () => {
      render(<NoDataEmptyState title="No Data Title" />);
      expect(screen.getByText('No Data Title')).toBeInTheDocument();
      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('renders NoResultsEmptyState correctly', () => {
      render(<NoResultsEmptyState description="No results found" />);
      expect(screen.getByText('No results found')).toBeInTheDocument();
      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('renders ErrorEmptyState correctly', () => {
      render(<ErrorEmptyState />);
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('renders LoadingEmptyState correctly', () => {
      render(<LoadingEmptyState />);
      expect(screen.getByText('Loading...')).toBeInTheDocument();
      expect(screen.getByRole('status')).toBeInTheDocument();
    });
  });

  describe('Context-specific Empty States', () => {
    it('renders TableEmptyState with actions', () => {
      const mockAdd = jest.fn();
      const mockRefresh = jest.fn();
      
      render(
        <TableEmptyState 
          onAdd={mockAdd}
          onRefresh={mockRefresh}
          addLabel="Add Row"
        />
      );
      
      expect(screen.getByText('No data in table')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Add Row' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
      
      fireEvent.click(screen.getByRole('button', { name: 'Add Row' }));
      expect(mockAdd).toHaveBeenCalled();
    });

    it('renders SearchEmptyState with search term', () => {
      const mockClear = jest.fn();
      const mockRefine = jest.fn();
      
      render(
        <SearchEmptyState 
          searchTerm="test query"
          onClearSearch={mockClear}
          onRefineSearch={mockRefine}
        />
      );
      
      expect(screen.getByText(/No results found for "test query"/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Clear Search' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Refine Search' })).toBeInTheDocument();
    });

    it('renders ListEmptyState with actions', () => {
      const mockCreate = jest.fn();
      const mockImport = jest.fn();
      
      render(
        <ListEmptyState 
          onCreate={mockCreate}
          onImport={mockImport}
          createLabel="Create Item"
          importLabel="Import CSV"
        />
      );
      
      expect(screen.getByText('No items in list')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Create Item' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Import CSV' })).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should not have accessibility violations', async () => {
      const { container } = render(<EmptyState />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should be keyboard navigable', () => {
      const mockAction = jest.fn();
      render(
        <EmptyState
          actions={[{ label: 'Test Action', onClick: mockAction }]}
        />
      );
      
      const button = screen.getByRole('button', { name: 'Test Action' });
      button.focus();
      expect(button).toHaveFocus();
      
      fireEvent.keyDown(button, { key: 'Enter' });
      expect(mockAction).toHaveBeenCalled();
    });

    it('should have proper ARIA roles', () => {
      render(<EmptyState />);
      const statusElement = screen.getByRole('status');
      expect(statusElement).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('handles empty actions array', () => {
      render(<EmptyState actions={[]} />);
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('handles missing optional props', () => {
      render(<EmptyState />);
      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('handles very long titles and descriptions', () => {
      const longTitle = 'A'.repeat(200);
      const longDescription = 'B'.repeat(500);
      
      render(
        <EmptyState 
          title={longTitle}
          description={longDescription}
        />
      );
      
      expect(screen.getByText(longTitle)).toBeInTheDocument();
      expect(screen.getByText(longDescription)).toBeInTheDocument();
    });
  });
});
