export type Id = string

export type Organization = {
  id: Id
  name: string
  slug: string
}

export type Branch = {
  id: Id
  organizationId: Id
  name: string
  code?: string
}

export type Permission = {
  id: Id
  module: string
  action: string
  description?: string
}

export type Role = {
  id: Id
  name: string
  description?: string
  permissions?: Permission[]
}

export type User = {
  id: Id
  organizationId: Id
  branchId: Id
  firstName: string
  lastName: string
  email: string
  roles?: Role[]
  permissions?: string[]
}

export type Patient = {
  id: Id
  organizationId: Id
  branchId: Id
  firstName: string
  lastName: string
  phone?: string
  email?: string
}

export type Appointment = {
  id: Id
  patientId: Id
  doctorId: Id
  scheduledStart: string
  scheduledEnd: string
  status: string
}

export type Invoice = {
  id: Id
  patientId: Id
  invoiceNumber: string
  total: number
  status: string
}

export type Task = {
  id: Id
  title: string
  status: string
  priority: string
}
