from django.apps import AppConfig


class BillingConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.billing'
    verbose_name = 'Billing'

    def ready(self):
        """Import signals when app is ready"""
        import apps.billing.signals  # noqa
        
        # Monkey-patch django_ledger AccountModel.__str__ to handle None role_bs
        # This fixes: AttributeError: 'NoneType' object has no attribute 'upper'
        try:
            from django_ledger.models import AccountModel
            
            def fixed_str(self):
                """Fixed __str__ method that handles None role_bs"""
                # Handle case where role_bs property returns None
                role_bs_value = self.role_bs.upper() if self.role_bs else 'N/A'
                return '{x1} - {x5}: {x2} ({x3}/{x4})'.format(
                    x1=role_bs_value,
                    x2=self.name,
                    x3=self.role.upper() if self.role else 'N/A',
                    x4=self.balance_type or 'N/A',
                    x5=self.code or 'N/A'
                )
            
            # Apply the patch to override the inherited __str__ method
            AccountModel.__str__ = fixed_str
        except (ImportError, AttributeError):
            # If django_ledger is not installed or model doesn't exist, skip patching
            pass
        
        # Monkey-patch django_ledger LedgerModel.has_wrapped_model() to return boolean
        # This fixes: KeyError when Django admin tries to display boolean icon for InvoiceModel instance
        try:
            from django_ledger.models import LedgerModel
            
            def fixed_has_wrapped_model(self):
                """Fixed has_wrapped_model method that returns boolean instead of model instance"""
                if self.has_wrapped_model_info():
                    return True
                
                wrapped_model_info = self.get_wrapper_info
                for model_class, model_id in wrapped_model_info.items():
                    try:
                        # Original code returns getattr(self, model_id) which is the model instance
                        # We need to return True instead when the model exists
                        getattr(self, model_id)  # Verify it exists
                        return True
                    except Exception:
                        pass
                return False
            
            # Apply the patch
            LedgerModel.has_wrapped_model = fixed_has_wrapped_model
        except (ImportError, AttributeError):
            # If django_ledger is not installed or model doesn't exist, skip patching
            pass