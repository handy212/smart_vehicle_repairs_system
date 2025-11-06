"""
Tests for branches app
"""
from django.test import TestCase
from django.contrib.auth import get_user_model
from apps.branches.models import Branch

User = get_user_model()


class BranchModelTest(TestCase):
    """Test cases for Branch model"""
    
    def setUp(self):
        """Set up test data"""
        self.admin = User.objects.create_user(
            email='admin@test.com',
            username='admin',
            password='testpass123',
            first_name='Admin',
            last_name='User',
            role='admin',
            is_staff=True
        )
        
        self.branch = Branch.objects.create(
            name='Main Branch',
            code='MAIN',
            phone='555-0100',
            address='123 Main St',
            city='Springfield',
            state='IL',
            zip_code='62701',
            created_by=self.admin
        )
    
    def test_branch_creation(self):
        """Test creating a branch"""
        self.assertEqual(self.branch.name, 'Main Branch')
        self.assertEqual(self.branch.code, 'MAIN')
        self.assertTrue(self.branch.is_active)
    
    def test_branch_code_uppercase(self):
        """Test that branch code is converted to uppercase"""
        branch = Branch.objects.create(
            name='Test Branch',
            code='test',
            phone='555-0200',
            address='456 Test St',
            city='TestCity',
            state='TS',
            zip_code='12345',
            created_by=self.admin
        )
        self.assertEqual(branch.code, 'TEST')
    
    def test_get_next_workorder_number(self):
        """Test work order number generation"""
        wo_number = self.branch.get_next_workorder_number()
        self.assertEqual(wo_number, 'MAIN-WO000001')
        
        wo_number2 = self.branch.get_next_workorder_number()
        self.assertEqual(wo_number2, 'MAIN-WO000002')
    
    def test_headquarters_enforcement(self):
        """Test that only one branch can be headquarters"""
        branch2 = Branch.objects.create(
            name='Secondary Branch',
            code='SEC',
            phone='555-0300',
            address='789 Second St',
            city='OtherCity',
            state='OC',
            zip_code='54321',
            is_headquarters=True,
            created_by=self.admin
        )
        
        # Refresh first branch
        self.branch.refresh_from_db()
        self.assertFalse(self.branch.is_headquarters)
        self.assertTrue(branch2.is_headquarters)
