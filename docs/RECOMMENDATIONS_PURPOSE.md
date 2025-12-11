# Repair Recommendations - Purpose and Workflow

## 🎯 **What Are Recommendations Used For?**

**RepairRecommendations** are the bridge between diagnosis and actual work. They document:
1. **What needs to be fixed** (problem identification)
2. **How to fix it** (repair action)
3. **What it will cost** (parts and labor estimates)
4. **Priority** (how urgent it is)

---

## 🔄 **Complete Workflow**

### **Step 1: Diagnosis Phase**
```
Customer Complaint → Codes Found → Tests Performed → Photos Taken
```

### **Step 2: Recommendations Created**
```
Technician creates recommendations based on findings:
- "Replace spark plugs" (from code P0301)
- "Repair brake line leak" (from visual inspection)
- "Replace oxygen sensor" (from test results)
```

### **Step 3: Customer Approval**
```
Recommendations are presented to customer:
- Customer can approve/decline each recommendation
- Customer sees: description, priority, estimated cost
- Customer makes decision: "Yes, fix this" or "No, skip this"
```

### **Step 4: Convert to Tasks**
```
Approved recommendations → ServiceTasks:
- Each approved recommendation becomes a work order task
- Labor hours and costs are copied
- Tasks are sequenced by priority
- Technicians can then execute the tasks
```

### **Step 5: Estimate Creation**
```
Recommendations are also used to create estimates:
- Parts from recommendations become estimate line items
- Labor from recommendations becomes estimate line items
- Customer sees full estimate before work begins
```

---

## 📋 **Recommendation Structure**

### **Fields**:
- **Description**: What needs to be done
- **Recommendation Type**: repair, replace, service, inspection, etc.
- **Priority**: critical, necessary, recommended, advisory
- **Estimated Labor Hours**: How long it will take
- **Estimated Labor Cost**: Cost of labor
- **Parts Needed**: List of parts required (JSON array)
- **Customer Approved**: Whether customer approved it
- **Converted to Task**: Link to ServiceTask if converted

---

## 🎯 **Key Use Cases**

### **1. Customer Communication**
- **Show customer what's wrong**: Clear descriptions
- **Get customer approval**: Approve/decline workflow
- **Price transparency**: Show estimated costs upfront

### **2. Work Planning**
- **Convert to actionable tasks**: Recommendations → ServiceTasks
- **Sequence work**: Priority-based task ordering
- **Resource planning**: Labor hours and parts needed

### **3. Estimate Generation**
- **Create estimates**: Parts and labor from recommendations
- **Pricing consistency**: Recommendations drive estimate line items
- **Link diagnosis to billing**: Estimate references diagnosis

### **4. Work Tracking**
- **Track approval status**: Which recommendations approved?
- **Track conversion**: Which recommendations became tasks?
- **Track completion**: Which tasks are done?

---

## 🔗 **Integration Points**

### **1. Diagnosis → Recommendations**
- Based on diagnostic codes, tests, and findings
- Technician documents what needs fixing

### **2. Recommendations → Tasks**
- Approved recommendations automatically become ServiceTasks
- Tasks appear in work order for technicians to execute

### **3. Recommendations → Estimates**
- Recommendations provide parts and labor for estimate
- Estimate line items come from recommendations

### **4. Recommendations → Customer**
- Customer sees recommendations with costs
- Customer approves/declines
- Only approved recommendations become work

---

## 💡 **Why This Matters**

### **Without Recommendations**:
- ❌ No structured way to document what needs fixing
- ❌ No customer approval process
- ❌ Manual task creation (error-prone)
- ❌ Disconnect between diagnosis and work

### **With Recommendations**:
- ✅ Clear documentation of what needs fixing
- ✅ Customer approval workflow
- ✅ Automatic task creation
- ✅ Seamless diagnosis → work flow

---

## 📊 **Example Flow**

### **Scenario: Engine Misfire**

1. **Diagnosis**:
   - Code P0301 found (Cylinder 1 Misfire)
   - Compression test performed (low compression)
   - Visual inspection (spark plug looks worn)

2. **Recommendations Created**:
   - "Replace spark plugs" - Priority: Necessary - Cost: $150
   - "Repair compression issue" - Priority: Critical - Cost: $500
   - "Replace ignition coil" - Priority: Recommended - Cost: $200

3. **Customer Approval**:
   - Customer approves: Spark plugs, Compression repair
   - Customer declines: Ignition coil (will wait)

4. **Convert to Tasks**:
   - Task 1: Replace spark plugs (approved recommendation)
   - Task 2: Repair compression issue (approved recommendation)
   - Task 3: Ignition coil (skipped - not approved)

5. **Estimate Created**:
   - Line items from approved recommendations
   - Customer sees total cost
   - Work can begin

---

## 🎯 **Summary**

**Recommendations are used for**:
1. ✅ **Documenting repair needs** from diagnosis
2. ✅ **Customer approval workflow** (what to fix, what to skip)
3. ✅ **Automatic task creation** (approved recommendations → ServiceTasks)
4. ✅ **Estimate generation** (parts and labor from recommendations)
5. ✅ **Work planning** (priority-based sequencing)
6. ✅ **Cost tracking** (estimated vs actual costs)

**They are the critical link between diagnosis and actual repair work!**

