# Rockets Server & @Concepta Modules - Development Guide

> **Architecture Guide**: This document provides the overview and navigation for developing with Rockets Server SDK and @Concepta modules. For specific patterns, see the specialized guides linked below.

## 🚀 **What You Get for Free**

The Rockets Server SDK provides all authentication and user management out of the box:

### **Pre-Built Endpoints:**
- `POST /token/password` - Login  
- `POST /token/refresh` - Refresh tokens
- `POST /signup` - User registration
- `GET /user` - Get profile
- `POST /otp` - Send OTP
- `POST /recovery/password` - Password recovery
- `GET /admin/users` - Admin user management (when enabled)

### **Automatic Features:**
- JWT token handling
- Password hashing  
- Email OTP (2FA)
- OAuth flows (Google, GitHub, Apple)
- Account lockout protection
- Session management

**👉 For complete SDK features and configuration, see [SDK.md](SDK.md)**

---

## 📚 **Specialized Guides**

Choose the guide you need:

### **🔧 [Configuration Guide](CONFIGURATION_GUIDE.md)**
**When to use:** Setting up your application
- Application bootstrap (`main.ts` setup)
- Swagger configuration with SDK
- Validation and exception filters
- Rockets Server module configuration

### **⚡ [CRUD Patterns Guide](CRUD_PATTERNS_GUIDE.md)**
**When to use:** Building entities with CRUD operations
- ConfigurableCrudBuilder vs Direct CRUD patterns
- When to use each approach
- Complete controller and service examples
- Constructor patterns and dependency injection

### **🛡️ [Error Handling Guide](ERROR_HANDLING_GUIDE.md)**  
**When to use:** Implementing proper exception handling
- EntityException base class pattern
- Exception templates and best practices
- CRUD service error handling patterns
- Unexpected vs controlled error flow

### **📋 [DTO Patterns Guide](DTO_PATTERNS_GUIDE.md)**
**When to use:** Creating DTOs for your entities
- PickType, PartialType, IntersectionType usage
- Validation decorators and API documentation
- Create, Update, and Paginated DTO patterns
- Common DTO composition utilities

### **🔐 [Access Control Guide](ACCESS_CONTROL_GUIDE.md)**
**When to use:** Implementing role-based permissions
- Access control service patterns (`implements CanAccess`)
- Role-based route protection
- Resource and action definitions
- Business logic access patterns

### **🤖 [AI Templates Guide](AI_TEMPLATES_GUIDE.md)**
**When to use:** AI-assisted development (Claude, Cursor, etc.)
- Copy-paste templates for entities
- File generation order and checklists
- Common patterns and anti-patterns
- Success criteria for generated code

---

## 🎯 **Quick Decision Tree**

```
What are you building?
├── New application setup → Configuration Guide
├── Entity with CRUD operations → CRUD Patterns Guide
├── Custom exceptions/error handling → Error Handling Guide  
├── DTOs and validation → DTO Patterns Guide
├── Role-based permissions → Access Control Guide
└── Using AI tools → AI Templates Guide
```

---

## 🚦 **Development Workflow**

### **Phase 1: Setup (5 minutes)**
1. Follow [Configuration Guide](CONFIGURATION_GUIDE.md) for app setup
2. Configure Rockets Server module
3. Set up Swagger and validation

### **Phase 2: Build Business Logic (95% of your time)**
1. **Plan Entity**: Define fields, relationships, business rules
2. **Choose Pattern**: Use [CRUD Patterns Guide](CRUD_PATTERNS_GUIDE.md) to pick approach
3. **Create Files**: Follow [AI Templates Guide](AI_TEMPLATES_GUIDE.md) for file order
4. **Add Validation**: Use [DTO Patterns Guide](DTO_PATTERNS_GUIDE.md) for DTOs
5. **Handle Errors**: Use [Error Handling Guide](ERROR_HANDLING_GUIDE.md) for exceptions
6. **Add Security**: Use [Access Control Guide](ACCESS_CONTROL_GUIDE.md) for permissions

### **What the SDK Provides:**

**✅ Use the SDK's built-in authentication:**
- Authentication endpoints are automatically available at `/token/password`, `/token/refresh`, `/signup`
- JWT handling is managed automatically with secure token generation and validation
- User management is included with admin endpoints at `/admin/users` when enabled
- Password hashing is handled securely with bcrypt and salt rounds
- Session management is controlled with configurable timeouts and refresh mechanisms

**👉 For complete SDK features and configuration, see [SDK.md](SDK.md)**

---

## 🏗️ **Architecture Principles**

### **Layer Separation**
- **Controllers**: Route handling + access control
- **Services**: Business logic + CRUD operations  
- **Model Services**: Business validation + complex queries
- **Entities**: Data models + relationships
- **DTOs**: API contracts + validation

### **Dependency Injection Patterns**
```typescript
// For CRUD operations
@InjectRepository(Entity) - Standard TypeORM

// For ModelServices  
@InjectDynamicRepository(entityKey) - Extended TypeORM

// For adapters in services
@Inject(EntityTypeOrmCrudAdapter) - CRUD adapters
```

### **Business Logic Flow**
```
Request → Controller → CRUD Service → Model Service → Database
         ↓           ↓               ↓
    Access Control  Business Logic  Validation
```

---

## 🎯 **Key Success Metrics**

**Your development is optimized when:**
- ✅ Can find the right guide in <30 seconds
- ✅ AI tools generate correct code from patterns
- ✅ New developers onboard in <2 days
- ✅ Code reviews focus on business logic, not patterns
- ✅ Consistent error handling across all modules
- ✅ Proper type safety with zero `any` types

---

## 📖 **Additional Resources**

- **[Technical Specification](TECHNICAL_SPECIFICATION.md)** - Business requirements and data models
- **[SDK Documentation](SDK.md)** - Complete Rockets Server SDK reference
- **[NPM Package](https://www.npmjs.com/package/@bitwild/rockets-server)** - Latest version and installation

---

**🚀 Ready to build? Pick the guide you need above and start coding!**