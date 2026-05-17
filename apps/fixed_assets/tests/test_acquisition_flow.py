from decimal import Decimal

import pytest

pytestmark = pytest.mark.legacy_integration

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.branches.models import Branch
from apps.fixed_assets.models import AssetAcquisitionRequest, AssetCategory, FixedAsset
from apps.inventory.models import Supplier


class AssetAcquisitionFlowTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        self.requester = User.objects.create_superuser(
            username='fa_requester',
            email='req@example.com',
            password='pass12345',
            role='admin',
        )
        self.approver = User.objects.create_superuser(
            username='fa_approver',
            email='app@example.com',
            password='pass12345',
            role='admin',
        )

        self.branch = Branch.objects.create(name='North', code='NTH', created_by=self.requester)
        self.category = AssetCategory.objects.create(name='Equipment FA Test')
        self.supplier = Supplier.objects.create(name='Vendor FA', supplier_code='VFA01')

    def _create_draft_via_api(self):
        self.client.force_authenticate(user=self.requester)
        payload = {
            'title': 'New lift',
            'description': 'Hydraulic lift',
            'proposed_asset_name': '2-post lift',
            'category': self.category.id,
            'branch': self.branch.id,
            'supplier': self.supplier.id,
            'expected_acquisition_cost': '12000.00',
            'salvage_value': '0.00',
        }
        url = reverse('api_fixed_assets:assetacquisitionrequest-list')
        response = self.client.post(url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)
        return response.data['id']

    def test_receive_requires_invoice_or_receipt_document(self):
        draft_id = self._create_draft_via_api()

        submit_url = reverse(
            'api_fixed_assets:assetacquisitionrequest-submit-for-approval',
            kwargs={'pk': draft_id},
        )
        response = self.client.post(
            submit_url,
            {'approver_ids': [self.approver.id]},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)

        self.client.force_authenticate(user=self.approver)
        approve_url = reverse(
            'api_fixed_assets:assetacquisitionrequest-approve',
            kwargs={'pk': draft_id},
        )
        response = self.client.post(approve_url, {}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)

        receive_url = reverse(
            'api_fixed_assets:assetacquisitionrequest-receive',
            kwargs={'pk': draft_id},
        )
        self.client.force_authenticate(user=self.approver)
        response = self.client.post(
            receive_url,
            {
                'acquisition_cost': '11950.00',
                'acquisition_date': '2026-05-01',
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn(b'invoice', response.content.lower())

    def test_full_flow_creates_fixed_asset(self):
        draft_id = self._create_draft_via_api()

        submit_url = reverse(
            'api_fixed_assets:assetacquisitionrequest-submit-for-approval',
            kwargs={'pk': draft_id},
        )
        response = self.client.post(
            submit_url,
            {'approver_ids': [self.approver.id]},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)

        self.client.force_authenticate(user=self.approver)
        approve_url = reverse(
            'api_fixed_assets:assetacquisitionrequest-approve',
            kwargs={'pk': draft_id},
        )
        response = self.client.post(approve_url, {}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)

        pdf = SimpleUploadedFile(
            'invoice.pdf',
            b'%PDF-1.4 minimal test content',
            content_type='application/pdf',
        )
        doc_url = reverse('api_documents:document-list')
        response = self.client.post(
            doc_url,
            {
                'title': 'Acquisition invoice',
                'file': pdf,
                'asset_acquisition_request': str(draft_id),
                'acquisition_document_kind': 'invoice',
            },
            format='multipart',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)

        receive_url = reverse(
            'api_fixed_assets:assetacquisitionrequest-receive',
            kwargs={'pk': draft_id},
        )
        response = self.client.post(
            receive_url,
            {
                'acquisition_cost': '11950.00',
                'acquisition_date': '2026-05-01',
                'received_notes': 'Received complete',
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)

        req = AssetAcquisitionRequest.objects.get(pk=draft_id)
        self.assertEqual(req.status, 'received')
        self.assertIsNotNone(req.created_asset_id)
        asset = FixedAsset.objects.get(pk=req.created_asset_id)
        self.assertEqual(asset.acquisition_cost, Decimal('11950.00'))
        self.assertEqual(asset.name, '2-post lift')
